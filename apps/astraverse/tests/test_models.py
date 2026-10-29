import base64
import json
import os
import httpx
from fastapi.testclient import TestClient
import astraverse.modules.models.router as model_router
from astraverse.api.application import app

client=TestClient(app)
CAPS=['text','vision','image','speech','transcription','video','video_generate']

def configuration(fallback=False):
    providers=[{'id':'primary','name':'Primary','base_url':'https://primary.example/v1','api_key':'test-private-secret','models':[{'id':'universal','capabilities':CAPS}]}]
    if fallback:
        providers.append({'id':'backup','name':'Backup','base_url':'https://backup.example/v1','models':[{'id':'backup-model','capabilities':['text','vision','video']}]})
    return {'providers':providers,'routes':{cap:{'primary':{'provider':'primary','model':'universal'},'fallbacks':[{'provider':'backup','model':'backup-model'}] if fallback and cap in ('text','vision','video') else []} for cap in CAPS},'timeout':15,'max_tokens':250}

def mock_transport(monkeypatch, handler):
    monkeypatch.setattr(model_router,'client_for',lambda timeout:httpx.AsyncClient(transport=httpx.MockTransport(handler),timeout=timeout))

def test_secret_persistence_redaction_and_clear():
    response=client.put('/api/models/settings',json=configuration())
    assert response.status_code==200
    assert 'test-private-secret' not in response.text
    assert 'api_key' not in response.json()['providers'][0]
    assert response.json()['providers'][0]['key_configured']
    assert os.stat(model_router.CONFIG_PATH).st_mode & 0o777 == 0o600
    public=client.get('/api/models/settings').json()
    assert client.get('/api/models/settings').headers['cache-control']=='no-store'
    public['providers'][0].pop('key_configured')
    public['providers'][0]['name']='Renamed'
    assert client.put('/api/models/settings',json=public).status_code==200
    assert model_router.load_settings().providers[0].api_key=='test-private-secret'
    public['providers'][0]['clear_key']=True
    assert client.put('/api/models/settings',json=public).status_code==200
    assert model_router.load_settings().providers[0].api_key is None


def test_invalid_routes_urls_and_origin_do_not_leak_secret():
    config=configuration()
    config['routes']['text']['primary']['model']='missing'
    response=client.put('/api/models/settings',json=config)
    assert response.status_code==422
    assert 'test-private-secret' not in response.text
    config=configuration()
    config['providers'][0]['base_url']='http://169.254.169.254/v1'
    assert client.put('/api/models/settings',json=config).status_code==422
    config['providers'][0]['base_url']='https://user:secret@provider.example/v1'
    assert client.put('/api/models/settings',json=config).status_code==422
    assert client.put('/api/models/settings',json=configuration(),headers={'origin':'https://evil.example'}).status_code==403
    assert client.post('/api/models/infer',json={'capability':'text','prompt':'hi'}).status_code==409


def test_fallback_and_main_chat_use_saved_route(monkeypatch):
    assert client.put('/api/models/settings',json=configuration(True)).status_code==200
    seen=[]
    def handler(request):
        seen.append(str(request.url))
        body=json.loads(request.content)
        assert body['max_tokens']==250
        if request.url.host=='primary.example':
            assert request.headers['authorization']=='Bearer test-private-secret'
            return httpx.Response(503,json={'error':'secret upstream diagnostics'})
        return httpx.Response(200,json={'choices':[{'message':{'content':'来自备用模型的真实回复'}}]})
    mock_transport(monkeypatch,handler)
    response=client.post('/api/chat',json={'message':'你好，笑一个'})
    assert response.status_code==200
    assert response.json()['mode']=='llm'
    assert response.json()['reply']=='来自备用模型的真实回复'
    # With an AI route, expression follows the model's structured decision.
    assert response.json()['expression'] is None
    assert len(seen)==2


def test_vision_video_frames_and_missing_inputs(monkeypatch):
    client.put('/api/models/settings',json=configuration())
    seen=[]
    def handler(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200,json={'choices':[{'message':{'content':'可见画面'}}]})
    mock_transport(monkeypatch,handler)
    attachment={'mime':'image/png','data':base64.b64encode(b'fixture-image').decode()}
    for cap in ('vision','video'):
        response=client.post('/api/models/infer',json={'capability':cap,'prompt':'描述','attachments':[attachment]})
        assert response.status_code==200
        assert response.json()['text']=='可见画面'
        assert seen[-1]['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/png;base64,')
    assert client.post('/api/models/infer',json={'capability':'vision','prompt':'hi'}).status_code==422
    assert client.post('/api/models/infer',json={'capability':'video','prompt':'hi','attachments':[{'mime':'image/png','data':'bad!'}]}).status_code==422


def test_generation_audio_transcription_video_and_probe(monkeypatch):
    client.put('/api/models/settings',json=configuration())
    def handler(request):
        path=request.url.path
        if path.endswith('/models'): return httpx.Response(200,json={'data':[{'id':'found-model'}]})
        if path.endswith('/images/generations'):
            assert json.loads(request.content)['model']=='universal'
            return httpx.Response(200,json={'data':[{'b64_json':base64.b64encode(b'png').decode()}]})
        if path.endswith('/audio/speech'): return httpx.Response(200,content=b'ID3-audio',headers={'content-type':'audio/mpeg'})
        if path.endswith('/audio/transcriptions'):
            assert b'filename="audio.wav"' in request.content
            return httpx.Response(200,json={'text':'音频转写完成'})
        if path=='/v1/videos':
            assert 'multipart/form-data' in request.headers['content-type']
            return httpx.Response(200,json={'id':'video_123','status':'queued'})
        if path.endswith('/videos/video_123/content'): return httpx.Response(200,content=b'video')
        if path.endswith('/videos/video_123'): return httpx.Response(200,json={'status':'completed','progress':100})
        raise AssertionError(path)
    mock_transport(monkeypatch,handler)
    assert client.post('/api/models/probe',json={'provider_id':'primary'}).json()['models']==['found-model']
    assert client.post('/api/models/infer',json={'capability':'image','prompt':'a star'}).json()['url'].startswith('data:image/png;base64,')
    response=client.post('/api/models/infer',json={'capability':'speech','prompt':'你好'})
    assert response.content==b'ID3-audio'
    assert response.headers['content-type']=='audio/mpeg'
    attachment={'mime':'audio/wav','data':base64.b64encode(b'RIFF-audio').decode()}
    assert client.post('/api/models/infer',json={'capability':'transcription','prompt':'转写','attachments':[attachment]}).json()['text']=='音频转写完成'
    assert client.post('/api/models/infer',json={'capability':'video_generate','prompt':'starry night'}).json()['id']=='video_123'
    assert client.get('/api/models/video/primary/video_123').json()['status']=='completed'
    assert client.get('/api/models/video/primary/video_123/content').content==b'video'


def test_failed_generation_never_retries(monkeypatch):
    client.put('/api/models/settings',json=configuration(True))
    calls=[]
    def handler(request):
        calls.append(request.url)
        return httpx.Response(429,json={'error':'test-private-secret'})
    mock_transport(monkeypatch,handler)
    response=client.post('/api/models/infer',json={'capability':'image','prompt':'a star'})
    assert response.status_code==502
    assert len(calls)==1
    assert 'test-private-secret' not in response.text


def test_pose_partial_merge_expression_and_natural_controls():
    result=client.post('/api/tools/execute',json={'tool':'character.pose','arguments':{'leftArm':70,'rightElbow':100}})
    assert result.status_code==200
    result=client.post('/api/tools/execute',json={'tool':'character.pose','arguments':{'headYaw':25}}).json()
    assert result['state']['pose']['leftArm']==70
    assert result['state']['pose']['headYaw']==25
    coerced=client.post('/api/tools/execute',json={'tool':'character.pose','arguments':{'headYaw':'20'}}).json()
    assert coerced['state']['pose']['headYaw']==20
    assert client.post('/api/tools/execute',json={'tool':'character.pose','arguments':{'rightElbow':190}}).status_code==422
    result=client.post('/api/tools/execute',json={'tool':'character.emote','arguments':{'emotion':'surprised','intensity':.9}}).json()
    assert result['state']['expression']=='surprised'
    assert result['state']['expressionIntensity']==.9
    assert client.post('/api/tools/execute',json={'tool':'character.emote','arguments':{'intensity':2}}).status_code==422
    result=client.post('/api/tools/execute',json={'tool':'character.presence','arguments':{'naturalMotion':False,'gazeTracking':False,'breath':.2}}).json()
    assert result['state']['naturalMotion'] is False
    assert client.post('/api/tools/execute',json={'tool':'character.rotate','arguments':{'degrees':60}}).json()['state']['rotation']==60
