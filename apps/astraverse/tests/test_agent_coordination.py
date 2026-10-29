import json
from types import SimpleNamespace
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.agents.profiles import AgentProfile, record, history, revision
from astraverse.modules.agents.execution import prepare_operation, context, history_text
from astraverse.modules.conversation.coordination import coordinate


def request(message='聊聊今天', current_activity='sleep', can_posture=True):
    return SimpleNamespace(message=message,current_activity=current_activity,can_posture=can_posture)


def test_music_control_does_not_wake_resting_body_or_compete_with_other_operations():
    response={'resource_action':{'type':'music.pause'},'stage_interaction':{'kind':'sit'},'character_ability':'run','action':'wave','pose':{'headYaw':10},'performance':{'gesture':'open','energy':.7}}
    value=coordinate(request('暂停音乐'),response)
    assert value['resource_action']['type']=='music.pause'
    assert all(key not in value for key in ('stage_interaction','character_ability','action','pose'))
    assert value['performance']['gesture']=='none'
    assert value['performance']['energy']<=.2


def test_ordinary_chat_preserves_activity_but_explicit_changes_and_sequenced_dance_are_allowed():
    assert 'action' not in coordinate(request(),{'action':'wave'})
    assert coordinate(request('请站起来'),{'action':'idle'})['action']=='idle'
    song={'resource_action':{'type':'resource.use','kind':'music','resource_id':'s'},'action':'dance'}
    value=coordinate(request('放一首歌并跳支舞',current_activity='idle'),song)
    assert value['follow_up_action']=='dance' and 'action' not in value
    assert 'follow_up_action' not in coordinate(request('放歌但是不要跳舞'),{'resource_action':{'type':'resource.use','kind':'music','resource_id':'s'}})


def test_browser_receipts_update_history_and_are_role_scoped_and_idempotent():
    client=TestClient(app);profile=AgentProfile(id='coord',name='测试角色')
    response={'reply':'准备播放歌曲','resource_action':{'type':'resource.use','kind':'music','resource_id':'song'}}
    prepare_operation(profile,response,revision(profile.id));record(profile,'播放歌曲',response,revision(profile.id))
    op=response['operation']['id']
    assert 'pending' in context(profile)
    assert '不能作为' in history_text(history(profile.id)[-1])
    url=f'/api/agents/{profile.id}/operations/{op}'
    failed={'status':'failed','note':'音源加载失败','reply':'歌曲没有播放成功。'}
    assert client.post(url,json=failed).status_code==200
    assert client.post(url,json=failed).status_code==200
    assert client.post(url,json={'status':'confirmed','note':'迟到的播放成功'}).status_code==409
    assert client.post(f'/api/agents/other/operations/{op}',json=failed).status_code==404
    assert history(profile.id)[-1]['text']=='歌曲没有播放成功。'
    assert history(profile.id)[-1]['operation']['status']=='failed'
    assert '音源加载失败' in context(profile)


def test_clear_chat_invalidates_old_receipts_and_temporary_roles_do_not_store_operations():
    client=TestClient(app);profile=AgentProfile(id='clear-coord',name='测试')
    response={'reply':'准备坐下','action':'sit'}
    prepare_operation(profile,response,0);record(profile,'坐下',response,0)
    op=response['operation']['id']
    assert client.delete(f'/api/agents/{profile.id}/conversation').status_code==200
    assert client.post(f'/api/agents/{profile.id}/operations/{op}',json={'status':'confirmed','note':'旧结果'}).status_code in (404,409)
    assert 'sit' not in context(profile)
    temporary=AgentProfile(id='temp-coord',name='临时',remember=False)
    response={'reply':'准备坐下','action':'sit'}
    prepare_operation(temporary,response,0)
    assert 'operation' not in response


def test_disabled_tools_never_survive_coordination():
    response=coordinate(request('坐下'),{'reply':'已经坐下','action':'sit'},False)
    assert response.get('action') is None
    assert '未开启' in response['reply']


def test_unconfirmed_and_failed_action_prose_is_not_used_as_memory_evidence(monkeypatch):
    import asyncio
    from astraverse.modules.agents import memory
    profile=AgentProfile(id='mem-coord',name='测试',model_scope='character')
    planned={'reply':'我已经播放了虚构歌曲','resource_action':{'type':'resource.use','kind':'music','resource_id':'missing'}}
    prepare_operation(profile,planned,0);record(profile,'我想听音乐',planned,0)
    record(profile,'这段话很有趣',{'reply':'我们可以从具体细节谈起'},0)
    captured=[]
    async def model(text,**kwargs):
        captured.append(json.loads(text))
        return {'text':json.dumps({'summary':'','facts':[]})}
    monkeypatch.setattr(memory,'get_profile',lambda *args:profile)
    monkeypatch.setattr(memory,'conversation',model)
    asyncio.run(memory.summarize(profile.id,0,0))
    assert captured
    assert all('虚构歌曲' not in item['text'] for item in captured[0]['assistant_context'])
    assert any('我想听音乐' in item['text'] for item in captured[0]['user_messages'])


def test_reading_is_a_primary_activity_even_when_the_body_is_idle():
    response=coordinate(request('这段是什么意思',current_activity='idle'),{'action':'dance','pose':{'headYaw':30}},True,{'active':True,'title':'红楼梦'})
    assert 'action' not in response and 'pose' not in response
    explicit=coordinate(request('请躺下听书',current_activity='idle'),{'action':'sleep'},True,{'active':True,'title':'红楼梦'})
    assert explicit['action']=='sleep'


def test_next_chat_uses_execution_evidence_not_the_original_planned_reply(monkeypatch):
    from astraverse.api import application as api
    client=TestClient(app)
    settings={'providers':[{'id':'p','name':'P','base_url':'https://model.example/v1','models':[{'id':'m','capabilities':['text']}]}],'routes':{'text':{'primary':{'provider':'p','model':'m'},'fallbacks':[]}}}
    assert client.put('/api/models/settings',json=settings).status_code==200
    first=client.post('/api/chat',json={'agent_id':'receipt-role','message':'播放一首歌','resources':[{'id':'song','kind':'music','name':'实际歌曲'}]}).json()
    assert first['operation']['status']=='pending'
    assert client.post(f"/api/agents/receipt-role/operations/{first['operation']['id']}",json={'status':'failed','note':'浏览器目标音源未播放','reply':'音乐没有播放成功。'}).status_code==200
    captured=[]
    async def model(*args,**kwargs):
        captured.append(kwargs)
        return {'text':json.dumps({'reply':'刚才的音乐没能播放起来。'}),'provider':'p','model':'m'}
    monkeypatch.setattr(api,'conversation',model)
    response=client.post('/api/chat',json={'agent_id':'receipt-role','message':'刚才操作成功了吗？'})
    assert response.status_code==200
    assert '浏览器目标音源未播放' in captured[0]['system']
    assert any('音乐没有播放成功' in t['content'] and 'failed' in t['content'] for t in captured[0]['history'])
