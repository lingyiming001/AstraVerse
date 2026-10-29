"""A configured character decides whether conversational invitations become actions."""
import json

from fastapi.testclient import TestClient
import pytest

import astraverse.api.application as api
from astraverse.modules.agents.profiles import DEFAULTS, prompt
from astraverse.modules.performance.schemas import model_body_action


def test_agency_prompt_preserves_identity_and_choice():
    text = prompt(DEFAULTS[2])
    assert '身份、性格、关系和边界作判断' in text
    assert '可以同意、提出不同意见、婉拒' in text
    assert DEFAULTS[2].name in text
    assert model_body_action(json.dumps({'body_action':'arbitrary-code'})) is None


@pytest.mark.parametrize('message,output,expected', [
    ('唱首歌', {'reply':'今天想先安静聊会儿。'}, None),
    ('给我跳一支舞吧', {'reply':'我现在想安静待一会儿。'}, None),
    ('给我跳一支舞吧', {'reply':'好，我跳一小段。','body_action':'dance'}, 'dance'),
])
def test_model_decides_body_and_ability_actions(monkeypatch, message, output, expected):
    profile = DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api, 'get_profile', lambda *args: profile)

    async def model(*args, **kwargs):
        assert '不是执行所有要求的工具' in kwargs['system']
        return {'text':json.dumps(output,ensure_ascii=False),'provider':'fake','model':'fake'}

    monkeypatch.setattr(api, 'conversation', model)
    result = TestClient(api.app).post('/api/chat', json={
        'message':message,
        'character_capabilities':['sing'],
        'current_activity':'idle',
    }).json()
    assert result['action'] == expected
    assert result.get('character_ability') is None
    assert result['mode'] == 'llm'


def test_model_can_decline_explicit_furniture_request(monkeypatch):
    profile = DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api, 'get_profile', lambda *args: profile)

    async def model(*args, **kwargs):
        return {'text':json.dumps({'reply':'我现在想先站着聊会儿。'},ensure_ascii=False),'provider':'fake','model':'fake'}

    monkeypatch.setattr(api, 'conversation', model)
    result = TestClient(api.app).post('/api/chat', json={
        'message':'你坐到椅子上吧',
        'current_scene_id':'scene-bedroom-day',
        'scene_interactions':[{'id':'chair','kind':'sit','label':'椅子'}],
    }).json()
    assert result['mode'] == 'llm'
    assert 'stage_interaction' not in result


def test_model_cannot_force_unsupported_posture(monkeypatch):
    profile = DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api, 'get_profile', lambda *args: profile)

    async def model(*args, **kwargs):
        assert '不支持坐下' in kwargs['system']
        return {'text':json.dumps({'reply':'好，我坐下。','body_action':'sit'},ensure_ascii=False),'provider':'fake','model':'fake'}

    monkeypatch.setattr(api, 'conversation', model)
    result = TestClient(api.app).post('/api/chat', json={'message':'请坐下','can_posture':False}).json()
    assert result['action'] is None
    assert '没有执行' in result['reply']
