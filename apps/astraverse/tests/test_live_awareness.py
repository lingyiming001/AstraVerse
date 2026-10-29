import asyncio
import json
from astraverse.modules.live.awareness import live_timing, clock_context
from astraverse.modules.live.service import Runtime
from astraverse.modules.agents.profiles import AgentProfile, AgentBehavior, shape_performance
from astraverse.modules.performance.schemas import parse_performance


def data(prompt):
    return json.JSONDecoder().raw_decode(prompt[prompt.index('{'):])[0]


def test_clock_has_no_invented_session_when_rehearsing():
    timing=data(clock_context('Asia/Shanghai'))
    assert timing['timezone']=='Asia/Shanghai' and '+08:00' in timing['local_time']
    assert 'session_elapsed_seconds' not in timing


def test_monotonic_timing_and_unknown_viewer(monkeypatch):
    import astraverse.modules.live.awareness as awareness
    state=Runtime();state.session_started=100;state.last_published=160
    monkeypatch.setattr(awareness.time,'monotonic',lambda:220)
    with live_timing(state):
        timing=data(clock_context('Asia/Shanghai'))
        assert timing['session_elapsed_seconds']==120 and timing['since_last_broadcast_seconds']==60
        assert timing['since_last_viewer_seconds'] is None
    assert 'session_elapsed_seconds' not in data(clock_context('Asia/Shanghai'))


def test_concurrent_rooms_do_not_share_time():
    async def run():
        async def room(seconds):
            import time
            state=Runtime();state.session_started=time.monotonic()-seconds
            with live_timing(state):
                await asyncio.sleep(0)
                return data(clock_context('Asia/Shanghai'))['session_elapsed_seconds']
        assert await asyncio.gather(room(20),room(200))==[20,200]
    asyncio.run(run())


def test_missing_model_expression_uses_chat_context_and_role_temperament():
    reply,cue,source=parse_performance('{"reply":"祝贺你！"}','我考上了，成功了')
    assert cue.emotion=='happy' and source=='local-fallback'
    quiet=AgentProfile(id='a',name='A',behavior=AgentBehavior(expressiveness=.1,energy=.1,movement='graceful'))
    lively=AgentProfile(id='b',name='B',behavior=AgentBehavior(expressiveness=.9,energy=.9,movement='lively'))
    a=shape_performance(quiet,cue);b=shape_performance(lively,cue)
    assert a['intensity']<b['intensity'] and a['energy']<b['energy']
    assert a['movement']=='graceful' and b['movement']=='lively'
    assert parse_performance('{"reply":"我在听。","performance":{}}','别笑，我很难过')[1].emotion=='relaxed'


def test_explicit_model_expression_is_preserved():
    _,cue,source=parse_performance('{"reply":"这个发现很有趣。","performance":{"emotion":"curious","intensity":0.3}}','今天有好消息')
    assert source=='model' and cue.emotion=='curious'
