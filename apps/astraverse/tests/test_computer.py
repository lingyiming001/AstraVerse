import asyncio
import base64
import json
import time
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from astraverse.api.application import app
import astraverse.modules.computer.service as computer
import astraverse.modules.plugins.router as plugins

class FakeDesktop:
    def __init__(self):self.calls=[]
    async def call(self,action,args):
        self.calls.append((action,args))
        if action=='status':return {'installed':True,'platform':'macos','screen_recording':True,'accessibility':True}
        if action=='screenshot':return {'mime':'image/jpeg','data':base64.b64encode(b'frame').decode(),'width':1280,'height':720}
        return {'executed':True,'action':action}

@pytest.fixture(autouse=True)
def desktop(tmp_path,monkeypatch):
    monkeypatch.setattr(plugins.platform,'system',lambda:'Darwin')
    monkeypatch.setattr(plugins,'CONFIG',tmp_path/'plugins.json')
    monkeypatch.setattr(plugins,'ROOT',tmp_path)
    fake=FakeDesktop();monkeypatch.setattr(computer,'adapter',fake)
    computer.stop();computer._audit.clear()
    yield fake
    computer.stop()

def client():return TestClient(app,client=('127.0.0.1',12345))
def start(c):
    assert c.put('/api/plugins/computer',json={'enabled':True}).status_code==200
    response=c.post('/api/computer/session');assert response.status_code==200,response.text
    assert response.json()['expires_in']==900
    return response.json()['session']

def test_disabled_and_session_required(desktop):
    c=client()
    assert c.post('/api/computer/session').status_code==403
    token=start(c)
    assert c.post('/api/computer/session').status_code==409
    r=c.post('/api/plugins/execute',json={'tool':'computer.click','arguments':{'session':token,'x':.5,'y':.5,'delay_seconds':0}})
    assert r.status_code==200
    assert desktop.calls[-1]==('click',{'x':.5,'y':.5,'button':'left','count':1})
    c.delete('/api/computer/session')
    assert c.post('/api/plugins/execute',json={'tool':'computer.screenshot','arguments':{'session':token}}).status_code==403

@pytest.mark.parametrize('tool,args',[('click',{'x':1.1,'y':0}),('key',{'key':'shell'}),('open_url',{'url':'javascript:alert(1)'}),('type',{'text':'x'*2001})])
def test_invalid_actions_are_not_sent(desktop,tool,args):
    c=client();token=start(c);before=len(desktop.calls)
    r=c.post('/api/plugins/execute',json={'tool':'computer.'+tool,'arguments':{'session':token,'delay_seconds':0,**args}})
    assert r.status_code==422
    assert len(desktop.calls)==before

def test_expiry_and_disable_revoke_session(desktop):
    c=client();token=start(c)
    computer._expires=time.monotonic()-1
    assert c.post('/api/plugins/execute',json={'tool':'computer.screenshot','arguments':{'session':token}}).status_code==403
    token=start(c);c.put('/api/plugins/computer',json={'enabled':False});c.put('/api/plugins/computer',json={'enabled':True})
    assert c.post('/api/plugins/execute',json={'tool':'computer.screenshot','arguments':{'session':token}}).status_code==403

def test_stop_cancels_delayed_action(desktop):
    token=start(client())
    async def task():
        pending=asyncio.create_task(computer.invoke('computer.type',{'session':token,'text':'hello','delay_seconds':.05}))
        await asyncio.sleep(.01);computer.stop()
        with pytest.raises(HTTPException):await pending
    asyncio.run(task())
    assert not any(action=='type' for action,_ in desktop.calls)

def test_remote_computer_endpoint_rejected():
    assert TestClient(app,client=('192.0.2.1',12345)).post('/api/computer/session').status_code==403

def test_plan_is_preview_only_and_single_use(desktop,monkeypatch):
    import astraverse.modules.models.router as models
    c=client();token=start(c)
    async def fake(*args,**kwargs):
        assert kwargs['capability']=='vision'
        assert token not in kwargs['system']
        return {'text':json.dumps({'reason':'目标位置','action':'click','arguments':{'x':.4,'y':.6}})}
    monkeypatch.setattr(models,'conversation',fake)
    r=c.post('/api/computer/plan',json={'session':token,'agent_id':'character-0','goal':'点击目标'})
    assert r.status_code==200,r.text
    assert not any(action=='click' for action,_ in desktop.calls)
    plan_id=r.json()['plan_id']
    computer._pending[plan_id]['arguments']['delay_seconds']=0
    assert c.post('/api/computer/execute-plan',json={'session':token,'plan_id':plan_id}).status_code==200
    assert c.post('/api/computer/execute-plan',json={'session':token,'plan_id':plan_id}).status_code==409
    assert len([a for a,_ in desktop.calls if a=='click'])==1
    assert all('text' not in record and 'session' not in record for record in computer._audit)

@pytest.mark.parametrize('result',['null','[]','{"action":"shell","arguments":{}}','{"action":"click","arguments":{"x":99,"y":0}}'])
def test_invalid_model_plan_never_executes(desktop,monkeypatch,result):
    import astraverse.modules.models.router as models
    async def fake(*args,**kwargs):return {'text':result}
    monkeypatch.setattr(models,'conversation',fake)
    c=client();token=start(c)
    assert c.post('/api/computer/plan',json={'session':token,'agent_id':'character-0','goal':'看看'}).status_code==422
    assert not any(a not in ('status','screenshot') for a,_ in desktop.calls)

def test_disabled_character_cannot_request_computer_plan(desktop,monkeypatch):
    import astraverse.modules.agents.profiles as profiles
    monkeypatch.setattr(profiles,'get_profile',lambda *args:profiles.DEFAULTS[0].model_copy(update={'allow_plugins':False}))
    c=client();token=start(c)
    assert c.post('/api/computer/plan',json={'session':token,'agent_id':'character-0','goal':'看看'}).status_code==403
    assert not any(a=='screenshot' for a,_ in desktop.calls)


def test_stop_cancels_pending_session_start(desktop,monkeypatch):
    c=client();c.put('/api/plugins/computer',json={'enabled':True})
    original=desktop.call
    async def delayed(action,args):
        if action=='status':await asyncio.sleep(.05)
        return await original(action,args)
    monkeypatch.setattr(desktop,'call',delayed)
    async def task():
        pending=asyncio.create_task(computer.begin())
        await asyncio.sleep(.01);computer.stop()
        with pytest.raises(HTTPException):await pending
    asyncio.run(task());assert not computer.active()


def test_status_does_not_start_or_capture(desktop):
    c=client();c.put('/api/plugins/computer',json={'enabled':True})
    response=c.post('/api/plugins/execute',json={'tool':'computer.status','arguments':{}})
    assert response.status_code==200
    assert not response.json()['result']['active']
    assert desktop.calls==[('status',{})]
