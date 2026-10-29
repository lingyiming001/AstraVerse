import asyncio
import json
import time

from astraverse.modules.live import service
from astraverse.modules.live.awareness import live_timing, current_show_notes
from astraverse.modules.live.hosting import draft_issue, complete_excerpt, idle_task
from astraverse.modules.live.program import LiveProgram


def test_checks_repetition_without_requiring_a_topic_change():
    history=[{'role':'assistant','content':'这哪是冒险，是打卡。'}]
    assert draft_issue(json.dumps({'reply':'这哪是游戏，是上班。'}),history,autonomous=True)
    assert not draft_issue(json.dumps({'reply':'我更喜欢把任务攒到周末一起做，不想每天惦记。'}),history,autonomous=True)
    assert draft_issue('{"reply":"没写完',history)
    assert draft_issue(json.dumps({'reply':'（笑）继续。'}),history)
    assert draft_issue(json.dumps({'reply':'昨天我翻出一张旧糖纸。'}),history,autonomous=True)
    assert draft_issue(json.dumps({'reply':'我试过连续30天写手账。'}),history,autonomous=True)
    assert draft_issue(json.dumps({'reply':'晚上好～刚泡了杯蜂蜜水。'}),history)
    assert draft_issue(json.dumps({'reply':'我们继续聊爱好。','show_notes':{'next_point':'说一个我自己停掉的计划'}}),history,autonomous=True)
    assert not draft_issue(json.dumps({'reply':'比如有人翻出一张旧糖纸。'}),history,autonomous=True)
    assert complete_excerpt('第一句说完。第二句很长还没有说完',10)=='第一句说完。'


def test_show_notes_are_room_local_and_not_spoken():
    async def run():
        async def room(topic):
            state=service.Runtime()
            state.show_notes={'topic':topic,'next_point':'比较两种选择','complete':False}
            with live_timing(state):
                await asyncio.sleep(0)
                assert current_show_notes()['topic']==topic
                assert topic in idle_task('房间','其他参考',current_show_notes())
            assert current_show_notes() is None
        await asyncio.gather(room('游戏'),room('早餐'))
    asyncio.run(run())


def test_bad_draft_has_only_one_correction_and_stays_off_air(monkeypatch):
    import astraverse.api.application as api
    from astraverse.modules.agents.profiles import AgentProfile
    monkeypatch.setattr(api,'get_profile',lambda _:AgentProfile(id='a',name='A',model_scope='character'))
    calls=[]
    async def model(content,**kwargs):
        calls.append(content)
        if len(calls)==1:return {'text':'普通文字夹带 {"performance":{"emotion":"happy"}}'}
        return {'text':json.dumps({'reply':'任务可以攒到周末做，我比较喜欢这种安排。','show_notes':{'topic':'任务安排','next_point':'每日任务的另一种设计','complete':False}})}
    monkeypatch.setattr(api,'conversation',model)
    result=asyncio.run(api.live_response('a','主持','游戏','房间',[],kind='knowledge'))
    assert len(calls)==2 and '重新生成要求' in calls[-1]
    assert not result['blocked'] and result['show_notes']['topic']=='任务安排'
    async def invalid(*args,**kwargs):return {'text':'格式仍然不对'}
    monkeypatch.setattr(api,'conversation',invalid)
    result=asyncio.run(api.live_response('a','主持','游戏','房间',[],kind='knowledge'))
    assert result['blocked'] and result['reply']=='' and result['show_notes'] is None


def test_playback_pauses_auto_hosting_and_releases_after_last_browser(monkeypatch):
    state=service.Runtime();state.status='waiting';state.last_viewer=time.monotonic()-1000
    row={'agent_id':'a','name':'测试','cooldown':5,'send_to_platform':False,'voice':True,'transport':'bridge'}
    monkeypatch.setattr(service,'rt',lambda _:state)
    monkeypatch.setattr(service,'channel',lambda _:row)
    monkeypatch.setattr(service,'profile_program',lambda _:LiveProgram(idle_enabled=True,idle_interval=20))
    calls=[]
    async def handler(*args):
        calls.append(1)
        return {'mode':'llm','reply':'现在继续未完的内容。'}
    async def emit(*args):pass
    monkeypatch.setattr(service,'idle_handler',handler)
    monkeypatch.setattr(service,'emit',emit)
    async def run():
        await service.report_playback('test',service.PlaybackReport(client_id='one',active=True))
        await service.report_playback('test',service.PlaybackReport(client_id='two',active=True))
        await service.maybe_idle('test')
        assert not calls
        await service.report_playback('test',service.PlaybackReport(client_id='one',active=False))
        assert service.playback_active(state)
        await service.report_playback('test',service.PlaybackReport(client_id='two',active=False))
        assert not service.playback_active(state)
        await service.maybe_idle('test')
        assert not calls  # Waiting begins when playback finishes.
        state.last_reply=0
        await service.maybe_idle('test')
        assert calls==[1]
        state.playback={'closed-tab':time.monotonic()-1}
        assert not service.playback_active(state)
    asyncio.run(run())


def test_only_published_output_updates_notes(monkeypatch):
    state=service.Runtime();state.status='waiting'
    row={'agent_id':'a','name':'测试','cooldown':5,'send_to_platform':False,'voice':False,'transport':'bridge'}
    monkeypatch.setattr(service,'rt',lambda _:state)
    monkeypatch.setattr(service,'channel',lambda _:row)
    monkeypatch.setattr(service,'profile_program',lambda _:LiveProgram())
    events=[]
    async def emit(_,event):events.append(event)
    monkeypatch.setattr(service,'emit',emit)
    notes={'topic':'游戏任务','next_point':'比较周任务','complete':False}
    async def run():
        result={'reply':'任务可以攒到周末做，我比较喜欢这种安排。','show_notes':notes}
        assert not await service.publish('test','a',result,'主持',revision=100,kind='knowledge')
        assert state.show_notes is None
        assert await service.publish('test','a',result,'主持',revision=0,kind='knowledge')
        assert state.show_notes==notes and 'show_notes' not in events[-1]
        assert not await service.publish('test','a',dict(result,show_notes=dict(notes,topic='错误进度')),'主持',revision=0,kind='knowledge')
        assert state.show_notes==notes
    asyncio.run(run())
