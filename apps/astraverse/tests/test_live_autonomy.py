import asyncio
import time
import pytest
from pydantic import ValidationError
from astraverse.modules.live import service
from astraverse.modules.live.program import LiveProgram, autonomy_context
from astraverse.modules.live.content import blocked_output
from astraverse.modules.conversation.policy import OUTPUT_NOTICE


def setup_room(monkeypatch, **options):
    state = service.Runtime()
    state.status = 'waiting'
    state.last_viewer = time.monotonic() - 1000
    program = LiveProgram(idle_enabled=True, idle_interval=20, **options)
    row = dict(id='test', agent_id='a', name='测试', room='1', cooldown=5,
               voice=False, send_to_platform=True, transport='bridge', keyword='')
    events = []
    monkeypatch.setattr(service, 'rt', lambda cid: state)
    monkeypatch.setattr(service, 'channel', lambda cid: row)
    monkeypatch.setattr(service, 'profile_program', lambda aid: program)
    async def emit(cid, event): events.append(event)
    monkeypatch.setattr(service, 'emit', emit)
    async def handler(*args):
        assert args[3] == 'knowledge'
        return {'reply':'我喜欢游戏里藏在角落的小路，探索时总会多一点期待。', 'mode':'llm'}
    monkeypatch.setattr(service, 'idle_handler', handler)
    return state, program, events


def test_default_limits_and_output_gate():
    assert not LiveProgram().idle_enabled
    for options in ({'idle_interval':19}, {'idle_max_turns':11}, {'idle_mode':'other'}):
        with pytest.raises(ValidationError): LiveProgram(**options)
    program = LiveProgram(blocked_terms=' No Sale \n秘密')
    assert blocked_output('ＮＯ—ＳＡＬＥ', program)
    assert blocked_output('秘\u200b密', program)
    assert blocked_output(OUTPUT_NOTICE, program)
    assert not blocked_output('一起聊音乐', program)
    prompt = autonomy_context(program, 'dream', ['旧故事'])
    assert '虚构' in prompt and '旧故事' in prompt


def test_idle_success_tracks_fiction_and_caps(monkeypatch):
    state, program, events = setup_room(monkeypatch, idle_mode='memory', idle_max_turns=1)
    async def run():
        await service.maybe_idle('test')
        assert state.metrics['proactive'] == 1
        assert len(state.fiction) == 0 and len(state.turns) == 2
        assert state.outbox[0]['proactive'] and state.outbox[0]['reply_to'] is None
        assert events[0]['narrative'] == 'knowledge'
        state.last_idle_attempt = state.last_reply = 0
        await service.maybe_idle('test')
        assert state.metrics['proactive'] == 1
    asyncio.run(run())


@pytest.mark.parametrize('case', ['disabled','closing','queue','limit'])
def test_idle_respects_conditions(monkeypatch, case):
    state, program, events = setup_room(monkeypatch)
    if case == 'disabled': program.idle_enabled = False
    elif case == 'closing': program.segment = 'closing'
    elif case == 'limit': state.idle_count = program.idle_max_turns
    else: state.queue.put_nowait('pending')
    asyncio.run(service.maybe_idle('test'))
    assert not events and not state.outbox and not state.idle_generation


def test_viewer_interrupts_pending_generation(monkeypatch):
    state, program, events = setup_room(monkeypatch)
    async def run():
        entered = asyncio.Event()
        async def handler(*args):
            entered.set()
            await asyncio.Event().wait()
        monkeypatch.setattr(service, 'idle_handler', handler)
        pending = asyncio.create_task(service.maybe_idle('test'))
        await entered.wait()
        await service.enqueue('test', service.Danmaku(id='one', user='观众', text='你好', room='1'))
        await asyncio.wait_for(pending, 1)
        assert state.metrics['interrupted'] == 1 and state.idle_count == 0
        assert state.queue.qsize() == 1 and not state.outbox and not state.fiction
        assert not any(e['kind'] == 'reply' for e in events)
    asyncio.run(run())


def test_disabling_while_model_runs_drops_result(monkeypatch):
    state, program, events = setup_room(monkeypatch)
    async def handler(*args):
        program.idle_enabled = False
        return {'reply':'不应播出', 'mode':'llm'}
    monkeypatch.setattr(service, 'idle_handler', handler)
    asyncio.run(service.maybe_idle('test'))
    assert not events and not state.outbox and not state.turns


def test_blocked_reply_never_enters_public_stream_or_history(monkeypatch):
    state, program, events = setup_room(monkeypatch, blocked_terms='秘密')
    async def run():
        assert not await service.publish('test','a',{'reply':'秘 密'},'观众',revision=0)
    asyncio.run(run())
    assert state.metrics['blocked'] == 1
    assert not state.outbox and not state.turns and not state.fiction
    assert events == [{'kind':'moderation','text':'一条角色发言未通过内容检查，已停止投递。','agent_id':'a'}]


def test_duplicate_idle_is_suppressed(monkeypatch):
    state, program, events = setup_room(monkeypatch, idle_mode='memory')
    async def run():
        await service.maybe_idle('test')
        state.last_reply = state.last_idle_attempt = 0
        await service.maybe_idle('test')
    asyncio.run(run())
    assert state.metrics['proactive'] == 1 and state.metrics['idle_skipped'] == 1


def test_live_fiction_prompt_uses_public_context_and_checks_label(monkeypatch):
    import json
    import astraverse.api.application as api
    from astraverse.modules.agents.profiles import AgentProfile
    profile = AgentProfile(id='a', name='A', model_scope='character', memory_notes='PRIVATE_NOTE',
                           live_program=LiveProgram(fictional_lore='月海音乐旅人'))
    monkeypatch.setattr(api, 'get_profile', lambda aid: profile)
    async def model(*args, **kwargs):
        assert 'PRIVATE_NOTE' not in kwargs['system']
        assert '月海音乐旅人' in kwargs['system'] and '虚构' in kwargs['system']
        assert '旧故事' in kwargs['system']
        return {'text': json.dumps({'reply':'我想象了一个梦，月光在琴弦上流动。'}, ensure_ascii=False)}
    monkeypatch.setattr(api, 'conversation', model)
    async def run():
        result = await api.live_response('a','主持','音乐','房间',[],kind='dream',fiction=['旧故事'])
        assert result['reply'].startswith('【虚构梦境】') and not result['blocked']
        profile.live_program.blocked_terms = '虚构梦境'
        result = await api.live_response('a','主持','音乐','房间',[],kind='dream',fiction=['旧故事'])
        assert result['blocked'] and result['reply'] == ''
    asyncio.run(run())


def test_stop_cancels_idle_and_clears_story(monkeypatch):
    state, program, events = setup_room(monkeypatch)
    async def run():
        entered = asyncio.Event()
        async def handler(*args):
            entered.set()
            await asyncio.Event().wait()
        monkeypatch.setattr(service, 'idle_handler', handler)
        pending = asyncio.create_task(service.maybe_idle('test'))
        await entered.wait()
        await service.stop('test')
        await pending
        assert state.status == 'stopped' and state.idle_generation is None
        assert not state.outbox and not state.fiction
    asyncio.run(run())
