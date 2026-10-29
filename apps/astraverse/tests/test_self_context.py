import json
from astraverse.modules.agents.profiles import AgentProfile, KnowledgeEntry
from astraverse.modules.resources.selection import ResourceSummary
from astraverse.modules.conversation.self_context import self_context


def snapshot(text):
    return json.loads(text.split('：', 1)[1].split('\n', 1)[0])


def test_role_references_and_runtime_are_separate_and_current():
    role = AgentProfile(id='role-a', name='晴棠', identity='温柔的读书伙伴', strengths='诗词讨论', knowledge=[KnowledgeEntry(title='茶知识', content='茶叶来自茶树。')])
    song = ResourceSummary(id='s', kind='music', name='真实歌')
    book = ResourceSummary(id='b', kind='book', name='真实书')
    text = self_context(role, [song, book], capabilities=['walk'], current_music_id='s', music_playing=False)
    data = snapshot(text)
    assert data['role']['name'] == '晴棠'
    assert data['role']['discussion_strengths'] == '诗词讨论'
    assert data['available_reference_titles'] == ['茶知识']
    assert data['character_actions'] == ['walk']
    assert data['music'] == {'selected_title': '真实歌', 'playing': False}
    assert not data['accessible_library']['book']['examples'][0]['content_provided']
    assert '不能编造其情节' in text


def test_public_context_excludes_private_reference_titles_and_unknown_state_is_explicit():
    role = AgentProfile(id='role-a', name='晴棠', knowledge=[KnowledgeEntry(title='私密资料', content='私密正文'), KnowledgeEntry(title='公开资料', content='公开正文', public=True)])
    data = snapshot(self_context(role, [], public=True, capabilities=['walk']))
    assert data['available_reference_titles'] == ['公开资料']
    assert data['accessible_library'] == {}
    assert data['character_actions'] == []
    assert data['music']['playing'] is None
    assert '私密' not in self_context(role, [], public=True)


def test_disabled_tools_allow_understanding_but_not_promised_operations():
    role = AgentProfile(id='role-a', name='晴棠', allow_resources=False)
    data = snapshot(self_context(role, [ResourceSummary(id='b', kind='book', name='可知书名')], capabilities=['walk'], can_posture=True))
    assert not data['library_operations_enabled']
    assert not data['posture_supported']
    assert data['character_actions'] == []
    assert data['accessible_library']['book']['count'] == 1


def test_chat_passes_current_role_library_and_actual_paused_state_to_model(monkeypatch):
    import httpx
    from fastapi.testclient import TestClient
    from astraverse.api import application
    from astraverse.modules.models import router
    role = AgentProfile(id='grounded-role', name='晴棠', identity='读书伙伴', strengths='诗词讨论', knowledge=[KnowledgeEntry(title='茶知识', content='茶叶来自茶树。')])
    monkeypatch.setattr(application, 'get_profile', lambda *args: role)
    client = TestClient(application.app)
    settings = {'providers': [{'id': 'p', 'name': 'P', 'base_url': 'https://model.example/v1', 'models': [{'id': 'm', 'capabilities': ['text']}]}], 'routes': {'text': {'primary': {'provider': 'p', 'model': 'm'}, 'fallbacks': []}}}
    assert client.put('/api/models/settings', json=settings).status_code == 200
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': '我喜欢从诗词的具体意象聊起，也能参考这里的茶知识。'}}]})
    monkeypatch.setattr(router, 'client_for', lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout))
    response = client.post('/api/chat', json={'agent_id': role.id, 'message': '聊聊你的特点以及茶叶吧', 'resources': [{'id': 's', 'kind': 'music', 'name': '真实歌'}], 'current_music_id': 's', 'music_playing': False, 'character_capabilities': ['walk']})
    assert response.status_code == 200
    prompt = '\n'.join(item['content'] for item in captured[0]['messages'] if item['role'] == 'system')
    assert '角色当前事实与能力快照' in prompt
    assert '晴棠' in prompt and '诗词讨论' in prompt
    assert '茶叶来自茶树' in prompt
    assert '"selected_title": "真实歌", "playing": false' in prompt
    assert '"character_actions": ["walk"]' in prompt
