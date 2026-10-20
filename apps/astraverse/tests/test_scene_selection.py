import json
import pytest
from astraverse.modules.resources.selection import ResourceSummary, decide, model_resource_action, resource_context

SCENES = [ResourceSummary(id='scene-'+key, kind='scene', name=name) for key,name in [
    ('bedroom-day','晨光卧室'), ('bedroom-night','暖灯卧室'),
    ('park-day','午后公园'), ('park-dusk','萤光公园'),
    ('school-day','晴日教室'), ('school-sunset','放学后的教室')]]

@pytest.mark.parametrize('message,expected', [('去公园散步','scene-park-day'),('晚上去公园','scene-park-dusk'),('去卧室睡觉','scene-bedroom-night'),('去学校','scene-school-day'),('去放学后的教室','scene-school-sunset')])
def test_scene_alias(message, expected):
    assert decide(message,SCENES,None)['resource_action']['resource_id']==expected


def payload(resource_id='scene-bedroom-night',kind='scene'):
    return json.dumps({'resource_action':{'type':'resource.use','kind':kind,'resource_id':resource_id}})


def test_contextual_scene_and_current_scene():
    assert model_resource_action(payload(),'好困，准备睡觉了',SCENES)['resource_id']=='scene-bedroom-night'
    assert model_resource_action(payload(),'好困，准备睡觉了',SCENES,'scene-bedroom-night') is None

@pytest.mark.parametrize('message',['不要换场景','我不想去卧室','留在这里聊天','保持当前场景'])
def test_stay_in_scene(message):
    assert model_resource_action(payload(),message,SCENES) is None


def test_allowlist_and_other_resources():
    assert model_resource_action(payload('invented'),'准备睡觉了',SCENES) is None
    music=ResourceSummary(id='song',kind='music',name='Song')
    assert model_resource_action(payload('song','music'),'准备睡觉了',[music]) is None
    assert model_resource_action(payload('song','music'),'播放音乐',[music])['resource_id']=='song'
    assert 'scene-park-day' in resource_context(SCENES,'scene-park-day')

@pytest.mark.parametrize('allowed',[True,False])
def test_chat_contextual_scene_action(monkeypatch,allowed):
    from fastapi.testclient import TestClient
    import astraverse.api.application as api
    from astraverse.modules.agents.profiles import DEFAULTS
    profile=DEFAULTS[0].model_copy(update={'model_scope':'character','allow_plugins':False,'allow_resources':allowed})
    monkeypatch.setattr(api,'get_profile',lambda *args:profile)
    async def fake_conversation(*args,**kwargs):
        if allowed:assert '当前场景ID' in kwargs['system']
        return {'text':json.dumps({'reply':'我们到卧室休息吧。','resource_action':{'type':'resource.use','resource_id':'scene-bedroom-night','kind':'scene'}}),'provider':'fake','model':'fake'}
    monkeypatch.setattr(api,'conversation',fake_conversation)
    result=TestClient(api.app).post('/api/chat',json={'message':'好困，准备睡觉了','agent_id':profile.id,'resources':[r.model_dump() for r in SCENES],'current_scene_id':'scene-park-day'})
    assert result.status_code==200
    assert ('resource_action' in result.json())==allowed

@pytest.mark.parametrize('message',['别换地方','不想换场景','不要去公园'])
def test_explicit_scene_refusal(message):
    assert 'resource_action' not in decide(message,SCENES,None)
