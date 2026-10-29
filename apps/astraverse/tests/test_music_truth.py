from astraverse.modules.resources.selection import ResourceSummary, decide, grounded_music_reply


def test_empty_music_library_never_defers_recommendations_to_model():
    for message in ('放一首轻柔的音乐', '推荐适合心情的音乐', '放首歌', '继续播放'):
        result = decide(message, [], None)
        assert result is not None
        assert '没有' in result['reply']
        assert not result.get('resource_action')


def test_music_claim_without_action_is_rejected_and_catalog_title_is_used():
    fabricated = '好呀，这就为你放一首轻柔的《空图书馆》，像翻过旧书那样安静。'
    assert '没有可播放' in grounded_music_reply(fabricated, [])
    song = ResourceSummary(id='song', name='真实音频', kind='music')
    action = {'type': 'resource.use', 'kind': 'music', 'resource_id': 'song'}
    assert grounded_music_reply(fabricated, [song], action) == '准备播放资料库中的《真实音频》。'
    assert '没有执行' in grounded_music_reply(fabricated, [song])
    assert grounded_music_reply('这首音乐的风格很安静。', []) == '这首音乐的风格很安静。'


def test_pause_requests_generate_an_actual_control_and_reject_false_completion():
    from astraverse.modules.resources.selection import model_resource_action
    import json
    for message in ('先把音乐暂停一下吧', '请关掉背景音乐', '音乐停一下', '别放歌了'):
        assert decide(message, [], None)['resource_action'] == {'type': 'music.pause'}
        assert model_resource_action(json.dumps({'resource_action': {'type': 'music.pause'}}), message, []) == {'type': 'music.pause'}
    for message in ('不要暂停音乐', '音乐暂停了吗？', '为什么音乐暂停了'):
        assert model_resource_action(json.dumps({'resource_action': {'type': 'music.pause'}}), message, []) is None
    assert '没有执行' in grounded_music_reply('音乐已经轻轻按暂停啦～', [])


def test_screenshot_recommendation_is_rejected_without_catalog_entry():
    screenshot = '那来一首《空图书馆》吧，像午后阳光斜斜照进老书架的安静感～'
    assert '没有可播放' in grounded_music_reply(screenshot, [])
    actual = ResourceSummary(id='song', name='恋爱天气预报', kind='music')
    assert '没有找到' in grounded_music_reply(screenshot, [actual])
    assert decide('放一首轻柔的音乐', [actual], None)['resource_action']['resource_id'] == 'song'
    assert '没有找到' in decide('播放《空图书馆》', [actual], None)['reply']


def test_model_enabled_chat_never_invents_songs_or_falls_through_on_missing_title(monkeypatch):
    from fastapi.testclient import TestClient
    from astraverse.api import application
    from astraverse.modules.models import router
    import httpx
    client = TestClient(application.app)
    settings = {'providers': [{'id': 'p', 'name': 'P', 'base_url': 'https://model.example/v1', 'models': [{'id': 'm', 'capabilities': ['text']}]}], 'routes': {'text': {'primary': {'provider': 'p', 'model': 'm'}, 'fallbacks': []}}}
    assert client.put('/api/models/settings', json=settings).status_code == 200
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={'choices': [{'message': {'content': '那来一首《空图书馆》吧，安静地听～'}}]})
    monkeypatch.setattr(router, 'client_for', lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout))
    resources = [{'id': 'song', 'name': '恋爱天气预报', 'kind': 'music'}]
    for message, catalog in [('放一首轻柔的音乐', []), ('放一首轻柔的音乐', resources), ('播放《空图书馆》', resources)]:
        response = client.post('/api/chat', json={'message': message, 'resources': catalog})
        assert response.status_code == 200
        result = response.json()
        assert '空图书馆' not in result['reply']
    assert not calls
    # Even casual model suggestions are checked against the actual catalog.
    response = client.post('/api/chat', json={'message': '今天很安静，陪我聊聊吧', 'resources': resources})
    assert response.status_code == 200
    assert '空图书馆' not in response.json()['reply']
    assert calls
