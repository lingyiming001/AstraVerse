import asyncio
from datetime import datetime, timezone
import time
import pytest
from pydantic import ValidationError
from astraverse.modules.live.routine import DailyRoutine, RoutineSlot, phase, routine_context
from astraverse.modules.live.program import LiveProgram
from astraverse.modules.live import service


def test_validation_and_defaults():
    assert not DailyRoutine().enabled
    assert LiveProgram().daily.timezone == 'Asia/Shanghai'
    for data in ({'timezone':'unknown/zone'}, {'interval':59}, {'max_attempts':0},
                 {'slots':[{'start':'08:00','title':'a'}]},
                 {'slots':[{'start':'00:00','title':'a'},{'start':'00:00','title':'b'}]}):
        with pytest.raises(ValidationError): DailyRoutine(**data)
    with pytest.raises(ValidationError): RoutineSlot(start='24:00',title='wrong')


def test_phase_timezone_boundaries_and_midnight():
    daily=DailyRoutine(enabled=True)
    # UTC midnight is 08:00 in Shanghai.
    current=phase(daily,datetime(2026,10,28,0,0,tzinfo=timezone.utc))
    assert current['title']=='早间见面'
    assert phase(daily,datetime(2026,10,28,4,0,tzinfo=timezone.utc))['activity']=='rest'
    assert phase(daily,datetime(2026,10,28,16,0,tzinfo=timezone.utc))['key']=='2026-10-29:00:00'
    assert '自由发挥' in routine_context(DailyRoutine())
    assert '不代表现实身体状态' in routine_context(daily)


def room(monkeypatch, activity='knowledge', cap=2):
    program=LiveProgram(daily=DailyRoutine(enabled=True,interval=60,max_attempts=cap))
    current={'key':'day:09:00','title':'测试时段','activity':activity,'topic':'音乐','next_start':'12:00','next_title':'休息'}
    state=service.Runtime();state.status='waiting';state.last_viewer=time.monotonic()-1000
    row=dict(id='test',agent_id='a',name='测试间',room='1',cooldown=5,voice=False,send_to_platform=True,transport='bridge',keyword='')
    events=[];calls=[]
    monkeypatch.setattr(service,'rt',lambda cid:state)
    monkeypatch.setattr(service,'channel',lambda cid:row)
    monkeypatch.setattr(service,'profile_program',lambda aid:program)
    monkeypatch.setattr(service,'phase',lambda daily:dict(current))
    async def emit(cid,event):events.append(event)
    async def handler(*args):
        calls.append(args)
        return {'reply':f'音乐是第{len(calls)}个新话题','mode':'llm'}
    monkeypatch.setattr(service,'emit',emit)
    monkeypatch.setattr(service,'idle_handler',handler)
    return state,program,current,events,calls


def test_daily_runs_without_idle_switch_or_viewers_but_honors_total_cap(monkeypatch):
    state,program,current,events,calls=room(monkeypatch)
    assert not program.idle_enabled
    state.idle_count=100  # daily mode replaces the old continuous cap
    async def run():
        for _ in range(3):
            state.last_idle_attempt=state.last_reply=0
            await service.maybe_idle('test')
        assert len(calls)==2 and state.daily_attempts==2
        assert len(state.outbox)==2  # final allowed attempt must be delivered
        await service.enqueue('test',service.Danmaku(id='a',user='观众',text='你好',room='1'))
        assert state.daily_attempts==2  # audience cannot reset the total budget
        assert state.daily_state['reason']=='budget'
    asyncio.run(run())


@pytest.mark.parametrize('reason',['rest','ended'])
def test_rest_and_24_hour_deadline_stop_model_and_delivery(monkeypatch,reason):
    state,program,current,events,calls=room(monkeypatch,activity='rest' if reason=='rest' else 'knowledge')
    if reason=='ended':state.daily_started=time.monotonic()-86401
    async def run():
        await service.maybe_idle('test')
        assert state.daily_state['reason']==reason
        assert not await service.publish('test','a',{'reply':'不该播出'},'观众',revision=0)
    asyncio.run(run())
    assert not calls and not state.outbox and not state.turns


def test_phase_change_during_model_drops_stale_output(monkeypatch):
    state,program,current,events,calls=room(monkeypatch)
    async def handler(*args):
        current.update(key='day:12:00',activity='rest')
        return {'reply':'过期节目','mode':'llm'}
    monkeypatch.setattr(service,'idle_handler',handler)
    asyncio.run(service.maybe_idle('test'))
    assert state.daily_attempts==1 and not state.outbox and not state.turns


def test_routine_transition_notice_once_and_resumes(monkeypatch):
    state,program,current,events,calls=room(monkeypatch,activity='rest')
    async def run():
        await service.maybe_idle('test');await service.maybe_idle('test')
        assert len(events)==1 and not calls
        current.update(key='day:14:00',activity='memory',title='故事')
        await service.maybe_idle('test')
        assert calls[0][3]=='knowledge'
        assert len([e for e in events if e['kind']=='routine'])==2
    asyncio.run(run())


def test_rest_overrides_exhausted_budget_and_skips_viewer_inference(monkeypatch):
    import contextlib
    state,program,current,events,calls=room(monkeypatch,activity='rest')
    state.daily_attempts=program.daily.max_attempts
    async def forbidden(*args):raise AssertionError('休息不能推理')
    monkeypatch.setattr(service,'chat_handler',forbidden)
    async def run():
        await service.enqueue('test',service.Danmaku(id='one',user='观众',text='你好',room='1'))
        task=asyncio.create_task(service.worker('test'))
        await asyncio.wait_for(state.queue.join(),1)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):await task
        assert state.daily_state['reason']=='rest' and state.metrics['filtered']==1
    asyncio.run(run())
    assert not state.outbox


def test_budget_only_blocks_proactive_not_real_viewer_reply(monkeypatch):
    state,program,current,events,calls=room(monkeypatch)
    state.daily_attempts=program.daily.max_attempts
    async def run():
        assert await service.publish('test','a',{'reply':'收到你的问题'},'观众',revision=0)
    asyncio.run(run())
    assert len(state.outbox)==1
