import json
import pytest
from fastapi.testclient import TestClient
import astraverse.api.application as api
from astraverse.modules.conversation.abilities import ability_intent, model_ability
from astraverse.modules.agents.profiles import DEFAULTS, prompt

@pytest.mark.parametrize('text,ability',[('跑起来','run'),('你走一走吧','walk'),('唱首歌','sing'),('请戴上耳机','headphones_on'),('摘下耳机','headphones_off'),('别跑了','stop')])
def test_character_ability_is_executable_not_prose(monkeypatch,text,ability):
    async def fail(*args,**kwargs):pytest.fail('Direct abilities must not call a model')
    monkeypatch.setattr(api,'conversation',fail)
    result=TestClient(api.app).post('/api/chat',json={'message':text,'character_capabilities':[ability]}).json()
    assert result['character_ability']==ability
    if ability=='sing':assert '合成音色' in result['reply']

@pytest.mark.parametrize('message',['我想跑步了','不要戴上耳机','跑步有什么好处'])
def test_no_implicit_direct_ability(message):assert ability_intent(message) is None

def test_unsupported_ability_and_model_allowlist():
    result=TestClient(api.app).post('/api/chat',json={'message':'唱首歌','character_capabilities':[]}).json()
    assert result['character_ability'] is None
    assert model_ability(json.dumps({'character_ability':'run'}),'试试别的动作',['sing']) is None
    assert model_ability(json.dumps({'character_ability':'headphones_on'}),'不要戴耳机',['headphones_on']) is None

def test_identity_prompt_binds_current_character():
    text=prompt(DEFAULTS[1]);assert '当前角色唯一ID' in text and DEFAULTS[1].id in text and DEFAULTS[1].name in text
    assert '不要串用其他角色的记忆' in text

def test_actor_scoped_events_and_state_reset():
    client=TestClient(api.app)
    with client.websocket_connect('/api/ws') as ws:
        ws.receive_json()
        client.post('/api/tools/execute',json={'actor_id':'actor-a','tool':'character.emote','arguments':{'emotion':'sad','intensity':1}})
        assert ws.receive_json()['actor_id']=='actor-a'
        response=client.post('/api/tools/execute',json={'actor_id':'actor-b','tool':'character.rotate','arguments':{'degrees':30}})
        event=ws.receive_json();assert event['actor_id']=='actor-b'
        assert response.json()['state']['expression']=='neutral'

@pytest.mark.parametrize('structured',[True,False])
def test_model_ability_proposal_uses_validated_capabilities(monkeypatch,structured):
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    async def model(*args,**kwargs):
        assert '当前身体活动' in kwargs['system']
        data={'reply':'我来哼一段原创旋律。'}
        if structured:data['character_ability']='sing'
        return {'text':json.dumps(data,ensure_ascii=False),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',model)
    result=TestClient(api.app).post('/api/chat',json={'message':'陪我放松一下','character_capabilities':['sing','stop'],'current_activity':'idle'}).json()
    assert result['character_ability']=='sing'
    assert result['interaction_origin']=='proposal'

def test_browser_commands_include_actor_and_client_context():
    client=TestClient(api.app)
    with client.websocket_connect('/api/ws') as ws:
        ws.receive_json()
        ws.send_json({'type':'command','actor_id':'actor-z','client_id':'browser-z','tool':'character.animate','arguments':{'animation':'wave'}})
        event=ws.receive_json();assert event['actor_id']=='actor-z' and event['client_id']=='browser-z'
        assert ws.receive_json()['type']=='result'
