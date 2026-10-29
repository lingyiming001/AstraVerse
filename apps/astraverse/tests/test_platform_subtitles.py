import httpx
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.viewing import subtitles


def test_bilibili_subtitles_validate_video_part_and_track_host(monkeypatch):
    def handler(request):
        if request.url.path == '/x/web-interface/view':
            return httpx.Response(200, json={'code': 0, 'data': {'bvid': 'BV1B7411m7LV', 'aid': 123, 'pages': [{'page': 2, 'cid': 456}]}})
        if request.url.path == '/x/player/wbi/v2':
            assert request.url.params['cid'] == '456'
            return httpx.Response(200, json={'code': 0, 'data': {'subtitle': {'subtitles': [{'lan': 'zh-CN', 'subtitle_url': '//aisubtitle.hdslb.com/bfs/subtitle/demo.json'}]}}})
        assert request.url.host == 'aisubtitle.hdslb.com'
        return httpx.Response(200, json={'body': [{'from': 1, 'to': 3, 'content': '真实字幕'}, {'from': 5, 'to': 4, 'content': 'invalid'}]})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(subtitles.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    response = TestClient(app).get('/api/watch/bilibili-subtitles?bvid=BV1B7411m7LV&p=2')
    assert response.status_code == 200, response.text
    assert response.json()['cues'] == [{'start': 1, 'end': 3, 'text': '真实字幕'}]
    assert TestClient(app).get('/api/watch/bilibili-subtitles?bvid=bad&p=2').status_code == 422
    assert TestClient(app).get('/api/watch/bilibili-subtitles?bvid=BV1B7411m7LV&p=1').status_code == 502


def test_reject_external_subtitle_url():
    try:
        subtitles.valid_track_url('https://example.com/private.json')
    except ValueError:
        pass
    else:
        raise AssertionError('external host accepted')
