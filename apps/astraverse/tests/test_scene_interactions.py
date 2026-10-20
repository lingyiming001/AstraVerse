import json
import pytest
from fastapi.testclient import TestClient
import astraverse.api.application as api
from astraverse.modules.agents.profiles import DEFAULTS
from astraverse.modules.conversation.interactions import SceneInteraction, explicit_intent, model_interaction, proposed_kind

TARGETS=[{'id':'bed','kind':'sleep','label':'床铺'},{'id':'chair-0','kind':'sit','label':'椅子'},{'id':'desk-0','kind':'study','label':'书桌'}]
SCENE='scene-bedroom-day'
@pytest.mark.parametrize('message,kind',[('你到床上休息一会吧','sleep'),('到床上休息会','sleep'),('睡觉','sleep'),('坐下','sit'),('你坐到椅子上吧','sit'),('在长椅上坐下','sit'),('坐在桌前学习','study'),('去书桌前学习吧','study')])
def test_real_directive_without_model(monkeypatch,message,kind):
    async def fail(*args,**kwargs):pytest.fail('Explicit scene interaction should not call model')
    monkeypatch.setattr(api,'conversation',fail)
    result=TestClient(api.app).post('/api/chat',json={'message':message,'current_scene_id':SCENE,'scene_interactions':TARGETS})
    assert result.status_code==200
    assert result.json()['stage_interaction']['kind']==kind

@pytest.mark.parametrize('message',['不要去床上睡觉','我想睡觉了','我想去床上休息','我躺在床上了','睡觉有什么好处','只是描述坐在椅子上的场景'])
def test_no_action_for_refusal_self_report_and_knowledge(message):
    assert explicit_intent(message) is None
    targets=[SceneInteraction(**t) for t in TARGETS]
    proposal=json.dumps({'stage_interaction':{'scene_id':SCENE,'target_id':'bed','kind':'sleep'}})
    assert model_interaction(proposal,message,targets,SCENE) is None

def test_missing_furniture_does_not_claim_execution():
    result=TestClient(api.app).post('/api/chat',json={'message':'你去床上躺下吧','current_scene_id':'scene-park-day','scene_interactions':[]}).json()
    assert result['stage_interaction'] is None
    assert '没有可用' in result['reply']

@pytest.mark.parametrize('structured',[True,False])
def test_ai_proposal_becomes_validated_execution(monkeypatch,structured):
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    async def model(*args,**kwargs):
        assert '当前可真实执行的场景交互' in kwargs['system']
        data={'reply':'嗯，我轻轻躺下，陪你休息。'}
        if structured:data['stage_interaction']={'target_id':'bed','kind':'sleep','scene_id':SCENE}
        return {'text':json.dumps(data,ensure_ascii=False),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',model)
    response=TestClient(api.app).post('/api/chat',json={'message':'今天有点累，陪陪我吧','current_scene_id':SCENE,'scene_interactions':TARGETS}).json()
    assert response['stage_interaction']=={'target_id':'bed','kind':'sleep','scene_id':SCENE}

@pytest.mark.parametrize('plan',[{'target_id':'invented','kind':'sleep','scene_id':SCENE},{'target_id':'bed','kind':'sit','scene_id':SCENE},{'target_id':'bed','kind':'sleep','scene_id':'other'}])
def test_invalid_model_targets_are_rejected(plan):
    assert model_interaction(json.dumps({'stage_interaction':plan}),'陪我休息',[SceneInteraction(**t) for t in TARGETS],SCENE) is None

def test_no_fabricated_blanket_or_story_action():
    assert proposed_kind('我梦见自己躺下，故事就此开始。') is None
    assert proposed_kind('我觉得你可以躺下休息。') is None
    assert proposed_kind('我轻轻坐在椅子上陪你。')=='sit'

def test_specific_chair_and_permission(monkeypatch):
    from astraverse.modules.conversation.interactions import select_interaction
    targets=[SceneInteraction(id='left',kind='sit',label='左侧长椅'),SceneInteraction(id='right',kind='sit',label='右侧长椅')]
    assert select_interaction('sit',targets,'park','坐在右边椅子上')['target_id']=='right'
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False,'allow_resources':False})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    async def model(*args,**kwargs):return {'text':json.dumps({'reply':'我在这里陪你。','stage_interaction':{'target_id':'bed','kind':'sleep','scene_id':SCENE}}),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',model)
    result=TestClient(api.app).post('/api/chat',json={'message':'今天有点累','scene_interactions':TARGETS,'current_scene_id':SCENE}).json()
    assert 'stage_interaction' not in result

@pytest.mark.parametrize('message,allowed',[('不要睡觉',True),('今天有点累',False)])
def test_unexecuted_model_action_is_not_claimed(monkeypatch,message,allowed):
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False,'allow_resources':allowed})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    async def model(*args,**kwargs):return {'text':json.dumps({'reply':'我轻轻躺下。','stage_interaction':{'target_id':'bed','kind':'sleep','scene_id':SCENE}}),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',model)
    result=TestClient(api.app).post('/api/chat',json={'message':message,'scene_interactions':TARGETS,'current_scene_id':SCENE}).json()
    assert 'stage_interaction' not in result
    assert '没有执行' in result['reply']
