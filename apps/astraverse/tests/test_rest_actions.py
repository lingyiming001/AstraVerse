import pytest
from fastapi.testclient import TestClient
from astraverse.api.application import app

@pytest.mark.parametrize('action',['sit','crouch','sleep','idle'])
def test_rest_action_tools(action):
    client=TestClient(app)
    response=client.post('/api/tools/execute',json={'tool':'character.animate','arguments':{'animation':action}})
    assert response.status_code==200
    state=client.get('/api/state').json()
    assert state['action']==action
    assert all(value==0 for value in state['pose'].values())

@pytest.mark.parametrize('message,action',[('坐下','sit'),('请蹲下吧','crouch'),('躺下睡觉','sleep'),('站起来','idle'),('醒来','idle')])
def test_rest_chat_without_model(message,action,monkeypatch):
    async def fail(*args,**kwargs):pytest.fail('Direct posture command must not call a model')
    monkeypatch.setattr('astraverse.api.application.conversation',fail)
    response=TestClient(app).post('/api/chat',json={'message':message})
    assert response.status_code==200
    assert response.json()['action']==action

@pytest.mark.parametrize('message',['不要坐下','我想睡觉了','睡觉有什么好处'])
def test_no_implicit_or_negated_posture(message):
    response=TestClient(app).post('/api/chat',json={'message':message})
    assert response.status_code==200
    assert response.json()['action'] not in ('sit','crouch','sleep')

@pytest.mark.parametrize('message,scene,kind',[
    ('上床睡觉','scene-bedroom-day','sleep'),
    ('请到床上休息会','scene-bedroom-night','sleep'),
    ('坐在桌前学习','scene-school-day','study'),
    ('坐下学习','scene-bedroom-day','study'),
])
def test_furniture_chat_without_model(message,scene,kind,monkeypatch):
    async def fail(*args,**kwargs): pytest.fail('Furniture commands must not call a model')
    monkeypatch.setattr('astraverse.api.application.conversation',fail)
    response=TestClient(app).post('/api/chat',json={'message':message,'current_scene_id':scene})
    assert response.status_code==200
    assert response.json()['interaction']==kind
    assert response.json()['mode']=='local-rules'

@pytest.mark.parametrize('scene,command',[(None,'上床睡觉'),('scene-park-day','坐下学习'),('scene-school-day','上床睡觉')])
def test_missing_furniture_has_no_interaction(scene,command):
    response=TestClient(app).post('/api/chat',json={'message':command,'current_scene_id':scene})
    assert response.status_code==200
    assert response.json()['interaction'] is None
    assert '请先进入' in response.json()['reply']
