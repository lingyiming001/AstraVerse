import asyncio
import json
import pytest
from pydantic import ValidationError
from astraverse.modules.agents.team import AgentTeam, direct_motion
from astraverse.modules.agents.profiles import AgentProfile
from astraverse.modules.performance.schemas import Performance
from astraverse.modules.live.service import Runtime, Danmaku, moderate_event


def test_defaults_and_limits():
    assert not AgentProfile(id='a',name='A').team.motion_enabled
    with pytest.raises(ValidationError):AgentTeam(viewer_cooldown=-1)


def test_local_motion_restraint_and_no_model_call():
    profile=AgentProfile(id='a',name='A',team=AgentTeam(motion_enabled=True))
    async def forbidden(*args,**kwargs):raise AssertionError('must not call model')
    cue,action,status=asyncio.run(direct_motion(profile,'别笑，我难过','我在听',Performance(emotion='happy',energy=.8),'wave',model_call=forbidden))
    assert cue.emotion=='relaxed' and cue.energy<=.2 and action=='wave' and status['motion']=='local'


@pytest.mark.parametrize('proposed,expected',[('wave','wave'),(None,None),('sleep','wave')])
def test_director_cannot_expand_authority(proposed,expected):
    profile=AgentProfile(id='a',name='A',team=AgentTeam(motion_enabled=True,motion_mode='llm'))
    async def model(*args,**kwargs):
        payload=json.loads(args[0]);assert payload['allowed_actions']==[None,'wave']
        return {'text':json.dumps({'performance':{'emotion':'curious'},'action':proposed})}
    cue,action,status=asyncio.run(direct_motion(profile,'你好','你好',Performance(),'wave',model_call=model))
    assert action==expected
    assert status['motion']==('fallback' if proposed=='sleep' else 'llm')


def test_director_failure_preserves_authorized_result():
    profile=AgentProfile(id='a',name='A',team=AgentTeam(motion_enabled=True,motion_mode='llm'))
    async def broken(*args,**kwargs):raise RuntimeError('offline')
    cue,action,status=asyncio.run(direct_motion(profile,'你好','你好',Performance(emotion='happy'),'wave',model_call=broken))
    assert cue.emotion=='happy' and action=='wave' and status['motion']=='fallback'


def test_moderation_dedupe_and_cooldown(monkeypatch):
    import astraverse.modules.live.service as live
    monkeypatch.setattr(live.time,'monotonic',lambda:100)
    state=Runtime();team=AgentTeam(moderation_enabled=True)
    event=lambda id,user,text:Danmaku(id=id,user=user,text=text,room='1')
    assert not moderate_event(state,event('1','A','你好呀'),team)
    assert moderate_event(state,event('2','B','你好呀'),team)=='重复刷屏'
    assert moderate_event(state,event('3','A','另一个问题'),team)=='发言过于频繁'
    assert not moderate_event(state,event('4','B','这是新问题'),team)
    monkeypatch.setattr(live.time,'monotonic',lambda:140)
    assert not moderate_event(state,event('5','A','你好呀'),team)


def test_moderation_rejection_does_not_interrupt_or_publish_raw(monkeypatch):
    import astraverse.modules.live.service as live
    state=Runtime();state.status='waiting'
    row={'agent_id':'a','room':'1'};events=[]
    monkeypatch.setattr(live,'channel',lambda cid:row)
    monkeypatch.setattr(live,'rt',lambda cid:state)
    monkeypatch.setattr(live,'profile_team',lambda aid:AgentTeam(moderation_enabled=True))
    monkeypatch.setattr(live,'moderate_event',lambda *args:'内容检查未通过')
    async def emit(cid,event):events.append(event)
    monkeypatch.setattr(live,'emit',emit)
    original=state.last_viewer
    result=asyncio.run(live.enqueue('test',Danmaku(id='x',user='A',text='RAW_BLOCKED',room='1')))
    assert not result['accepted'] and state.queue.empty()
    assert state.last_viewer==original and state.activity_revision==0
    assert 'RAW_BLOCKED' not in str(events)
