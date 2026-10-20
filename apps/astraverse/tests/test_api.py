from fastapi.testclient import TestClient
from astraverse.api.application import app, clients

client = TestClient(app)

def test_validated_move_and_unknown_tools():
    assert client.post('/api/tools/execute', json={'tool':'character.move','arguments':{'x':90}}).status_code == 422
    assert client.post('/api/tools/execute', json={'tool':'shell.exec'}).status_code == 404
    assert client.post('/api/tools/execute', json={'tool':'scene.navigate'}).status_code == 501
    result = client.post('/api/tools/execute', json={'tool':'character.move','arguments':{'x':1,'z':-1}}).json()
    assert result['state']['position'] == [1,0,-1]
    assert result['render_acknowledged'] is False

def test_websocket_command_broadcast_and_restore():
    with client.websocket_connect('/api/ws') as ws:
        assert ws.receive_json()['type'] == 'state'
        ws.send_json({'type':'command','tool':'character.dance','arguments':{}})
        assert ws.receive_json()['data']['action'] == 'dance'
        assert ws.receive_json()['type'] == 'result'
        ws.send_json({'type':'command','tool':'scene.load','arguments':{'scene':'not-real'}})
        assert ws.receive_json()['type'] == 'error'
        ws.send_text('{broken')
        assert ws.receive_json()['type'] == 'error'
        ws.send_json([])
        assert ws.receive_json()['type'] == 'error'
    assert not clients

def test_local_chat_and_capability_discovery(monkeypatch):
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    r = client.post('/api/chat', json={'message':'跳一支舞吧'}).json()
    assert r['mode'] == 'local-rules'
    assert r['action'] == 'dance'
    assert '本地规则' in r['reply']
    assert client.post('/api/chat', json={'message':' '}).status_code == 422
    tools = client.get('/api/tools').json()
    assert 'scene.navigate' in tools['planned']
    assert len(tools['tools']) == 14

def test_denies_remote_ws_origin():
    try:
        with client.websocket_connect('/api/ws', headers={'origin':'https://evil.example'}):
            assert False
    except Exception as exc:
        assert getattr(exc, 'code', None) == 1008
