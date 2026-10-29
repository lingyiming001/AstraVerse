import base64
import json
import pytest
from fastapi.testclient import TestClient
import astraverse.api.application as api
from astraverse.modules.agents.profiles import DEFAULTS

@pytest.mark.parametrize('with_frame',[True,False])
def test_viewing_routes_and_preserves_persona(monkeypatch,with_frame):
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    settings=[]
    monkeypatch.setattr(api,'model_settings',lambda p,cap='text':settings.append(cap) or type('Config',(),{'routes':{}})())
    async def fake_conversation(message,**kwargs):
        assert kwargs['capability']==('vision' if with_frame else 'text')
        assert profile.name in kwargs['system']
        assert '真实字幕' in kwargs['system']
        assert ('只收到一张' if with_frame else '未收到画面') in kwargs['system']
        assert bool(kwargs['attachments'])==with_frame
        if with_frame:assert kwargs['target_override'] is None
        return {'text':json.dumps({'reply':'我看到一片蓝色。' if with_frame else '你可以告诉我这一幕在讲什么。'}),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',fake_conversation)
    view={'title':'测试视频','current_time':12,'subtitle':'真实字幕','subtitle_source':'file'}
    if with_frame:view['frame']={'mime':'image/jpeg','data':base64.b64encode(b'test').decode()}
    result=TestClient(api.app).post('/api/chat',json={'message':'你怎么看这一幕','viewing':view})
    assert result.status_code==200,result.text
    assert settings==['vision' if with_frame else 'text']
    assert result.json()['mode']=='llm'

@pytest.mark.parametrize('view',[{'title':'x','current_time':-1},{'title':'x','frame':{'mime':'audio/wav','data':'dGVzdA=='}},{'title':'x','frame':{'mime':'image/jpeg','data':'invalid'}},{'title':'x','frame':{'mime':'image/jpeg','data':'a'*800001}}])
def test_invalid_viewing_rejected(view):
    assert TestClient(api.app).post('/api/chat',json={'message':'看看','viewing':view}).status_code==422
