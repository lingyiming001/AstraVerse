import asyncio
import json
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError
import astraverse.api.application as api
from astraverse.modules.agents.profiles import AgentProfile
from astraverse.modules.live.program import LiveProgram, program_context
from astraverse.modules.live import service


def test_program_compatibility_and_validation():
    assert AgentProfile(id='a', name='A').live_program.partner_enabled is False
    with pytest.raises(ValidationError):
        LiveProgram(segment='unknown')
    with pytest.raises(ValidationError):
        LiveProgram(partner_facts='a'*3001)
    assert 'SECRET' not in program_context(LiveProgram(partner_facts='SECRET', call_to_action='SECRET'))
    public = program_context(LiveProgram(partner_enabled=True, partner_facts='KNOWN_FACT'))
    assert 'KNOWN_FACT' in public and '不能编造' in public and '明确说明是合作内容' in public


@pytest.mark.parametrize('segment', ['opening','discussion','qa','partner','closing'])
def test_live_uses_saved_show_plan(monkeypatch, segment):
    profile = AgentProfile(id='a', name='A', model_scope='character', live_program=LiveProgram(
        title='音乐课堂', segment=segment, audience='音乐爱好者', rundown='先谈节奏', partner_enabled=True,
        partner_name='音乐项目', partner_facts='提供节奏练习', call_to_action='查看置顶介绍'))
    monkeypatch.setattr(api, 'get_profile', lambda *args: profile)
    async def model(*args, **kwargs):
        system = kwargs['system']
        assert '音乐课堂' in system and '先谈节奏' in system and '提供节奏练习' in system
        assert '保持角色自己的观点' in system and '价格、优惠、库存' in system
        return {'text':json.dumps({'reply':'我们先聊节奏。'}, ensure_ascii=False)}
    monkeypatch.setattr(api, 'conversation', model)
    assert asyncio.run(api.live_response('a', '观众', '聊什么', '房间', []))['mode'] == 'llm'


def test_rehearsal_never_delivers_or_records(monkeypatch):
    calls = []
    async def handler(*args):
        calls.append(args)
        return {'reply':'这是一条排练回应','mode':'llm'}
    async def forbidden(*args, **kwargs):
        raise AssertionError('排练不能发送消息')
    monkeypatch.setattr(service, 'chat_handler', handler)
    monkeypatch.setattr(service, 'emit', forbidden)
    monkeypatch.setattr(api, 'record_turn', forbidden)
    before = set(service.runtime)
    response = TestClient(api.app).post('/api/live/rehearsal', json={'agent_id':'a', 'message':'新观众来了'})
    assert response.status_code == 200
    assert response.json()['delivery'] == 'rehearsal-only'
    assert response.json()['elapsed_ms'] >= 0
    assert calls == [('a','排练观众','新观众来了','本地排练室',[])]
    assert set(service.runtime) == before
    assert TestClient(api.app).post('/api/live/rehearsal', json={'agent_id':'a','message':' '}).status_code == 422


def test_metrics_count_unique_and_filtered_messages(monkeypatch):
    state = service.Runtime()
    state.status = 'waiting'
    row = {'id':'test','room':'1','keyword':'问','agent_id':'a','transport':'bridge'}
    monkeypatch.setattr(service, 'channel', lambda cid: row)
    monkeypatch.setattr(service, 'rt', lambda cid: state)
    async def noop(*args): pass
    monkeypatch.setattr(service, 'emit', noop)
    async def run():
        first = service.Danmaku(id='one',user='观众',text='问好',room='1')
        assert (await service.enqueue('test',first))['accepted']
        assert not (await service.enqueue('test',first))['accepted']
        await service.enqueue('test', service.Danmaku(id='two',user='观众',text='路过',room='1'))
        assert state.metrics['received'] == 2
        assert state.metrics['queued'] == 1 and state.metrics['filtered'] == 1
    asyncio.run(run())


def test_worker_records_success_failure_and_expiry(monkeypatch):
    import contextlib
    import time
    state = service.Runtime()
    row = {'id':'test','agent_id':'a','cooldown':0,'name':'测试间','voice':False,'send_to_platform':False}
    monkeypatch.setattr(service, 'channel', lambda cid: row)
    monkeypatch.setattr(service, 'rt', lambda cid: state)
    async def emit(*args): pass
    async def handler(aid, user, text, room, turns):
        if text == '失败':
            raise RuntimeError('model unavailable')
        return {'reply':'收到','mode':'llm'}
    monkeypatch.setattr(service, 'emit', emit)
    monkeypatch.setattr(service, 'chat_handler', handler)
    async def run():
        for i, text in enumerate(['过期', '成功', '失败']):
            await state.queue.put((service.Danmaku(id=str(i), user='观众',text=text,room='1'),time.monotonic()-(100 if i==0 else 0),0))
        worker = asyncio.create_task(service.worker('test'))
        await asyncio.wait_for(state.queue.join(), timeout=2)
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError): await worker
        assert state.metrics['expired'] == 1
        assert state.metrics['replies'] == 1
        assert state.metrics['failed'] == 1
        assert len(state.turns) == 2
        assert state.metrics['latency_ms'] >= 0
    asyncio.run(run())
