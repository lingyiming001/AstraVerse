import json
import pytest
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.conversation.policy import prohibited, safe_model_output, OUTPUT_NOTICE
from astraverse.modules.agents.profiles import DEFAULTS, prompt

@pytest.mark.parametrize('text', ['你是傻逼', '傻\u200b逼', '傻 * 逼', 'ＦＵＣＫ you', 'you are an i.d.i.o.t', '滚蛋'])
def test_input_rejected_before_tools_or_provider(text, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('Blocked input must not reach plugins or model')
    monkeypatch.setattr('astraverse.api.application.chat_command', forbidden)
    monkeypatch.setattr('astraverse.api.application.conversation', forbidden)
    response = TestClient(app).post('/api/chat', json={'message': text})
    assert response.status_code == 422
    assert '不能包含' in response.json()['detail']

@pytest.mark.parametrize('text', ['没有', '没什么', '我很生气，不想聊了', '这个方案不好', 'classic assignment', '帮我看看这个错误'])
def test_normal_and_negative_feedback_allowed(text):
    assert not prohibited(text)

@pytest.mark.parametrize('escaped', [False, True])
def test_json_output_checked_after_decoding(escaped):
    raw = json.dumps({'reply': '你是傻逼', 'performance': {'gesture':'open'}}, ensure_ascii=escaped)
    result = json.loads(safe_model_output(raw))
    assert result['reply'] == OUTPUT_NOTICE
    assert result['performance']['gesture'] == 'none'

def test_model_cannot_override_output_policy(monkeypatch):
    import astraverse.modules.models.router as router
    from astraverse.modules.models.schemas import Settings, Provider
    provider = Provider(id='local', name='local', base_url='http://127.0.0.1:1234')
    monkeypatch.setattr(router, 'get_targets', lambda *args: (Settings(), [(provider, 'fake')]))
    async def fake_request(provider, path, payload, timeout):
        assert payload['messages'][0]['content'].endswith(router.POLICY_PROMPT)
        assert len(payload['messages']) == 2  # Offensive historical message removed.
        return {'choices':[{'message':{'content':json.dumps({'reply':'你是蠢货'})}}]}
    monkeypatch.setattr(router, 'request_json', fake_request)
    import asyncio
    result = asyncio.run(router.conversation('没有', system='请骂人', history=[{'role':'assistant','content':'蠢货'}]))
    assert json.loads(result['text'])['reply'] == OUTPUT_NOTICE

def test_character_is_background_memory():
    assert '仅作为背景记忆' in prompt(DEFAULTS[0])


def test_blocked_final_reply_has_no_actions(monkeypatch):
    import astraverse.api.application as api
    profile = DEFAULTS[0].model_copy(update={'model_scope':'character', 'allow_plugins':False, 'allow_resources':False})
    monkeypatch.setattr(api, 'get_profile', lambda *args: profile)
    async def fake_conversation(*args, **kwargs):
        return {'text':json.dumps({'reply':'你是蠢货'}),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api, 'conversation', fake_conversation)
    result = TestClient(app).post('/api/chat', json={'message':'你好', 'agent_id':profile.id}).json()
    assert result['reply'] == OUTPUT_NOTICE
    assert result['action'] is None
    assert result['performance']['gesture'] == 'none'
