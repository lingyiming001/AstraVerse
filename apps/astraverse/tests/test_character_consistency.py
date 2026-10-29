import asyncio
import json
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.agents.profiles import AgentProfile, history, record
from astraverse.modules.performance.schemas import Performance, parse_performance
from astraverse.modules.conversation.character import plan, stabilize, distressed
from astraverse.modules.conversation.character_output import data, generate, issue


def role():return AgentProfile(id='consistent',name='晴棠',personality='温柔、热情、有点幽默',preferences='喜欢纸质书与爵士乐',auto_summary=False)


def test_role_contract_survives_model_switch_and_changes_only_with_authored_voice():
    p=role();h=[{'role':'user','content':'我在练钢琴节奏'},{'role':'assistant','content':'可以先把速度慢下来，听清每一下。'}]
    a=plan(p,'然后呢',h)
    p.model_scope='character'
    from astraverse.modules.models.schemas import Target
    p.model=Target(provider='different-platform',model='another-model')
    b=plan(p,'然后呢',h)
    assert a==b and '钢琴' in a.context
    assert '不为了不同于上一轮而强制换角度' in a.context
    p.speaking_style='简洁从容，少用感叹'
    assert plan(p,'然后呢',h).signature!=a.signature


def test_short_ack_empathy_negation_and_public_isolation():
    p=role();private=[{'role':'user','content':'PRIVATE_NAME我最近很难过'}]
    assert '简短承接' in plan(p,'嗯',private).intent
    assert plan(p,'为什么呢',private).support
    assert not distressed('我不难过，也没有焦虑')
    assert not distressed('难过这个词是什么意思')
    public=plan(p,'继续',private,public=True,kind='knowledge')
    assert 'PRIVATE_NAME' not in public.context and not public.support
    assert '没有新弹幕' not in public.intent  # progress does not fabricate a viewer turn
    live=[{'role':'user','content':json.dumps({'viewer':'观众','danmaku':'海棠花开了'},ensure_ascii=False)}]
    assert '海棠花' in plan(p,'后来呢',live,public=True).context


def test_compatibility_wrappers_preserve_real_action_fields_but_plain_text_cannot_act():
    value={'reply':'好，我们接着聊书。','resource_action':{'type':'resource.use','resource_id':'book-one'},'performance':{'emotion':'curious'}}
    wrapped='<think>hidden reasoning</think>\n下面是回复：\n```json\n'+json.dumps(value,ensure_ascii=False)+'\n```'
    assert data(wrapped)==value
    assert data('我已经暂停了。')=={'reply':'我已经暂停了。'}
    assert data('<think>unfinished') is None
    assert data('prefix {"reply":"a"} {"reply":"b"}') is None
    assert data('{"reply":"unfinished') is None


def test_one_correction_no_infinite_loop_or_identity_leak():
    p=role();calls=[];pl=plan(p,'今天想聊书',[])
    async def provider(message,**kwargs):
        calls.append((message,kwargs))
        return {'text':json.dumps({'reply':'我是ChatGPT，很高兴帮助你。' if len(calls)==1 else '我偏爱有批注的书，读起来像有人在旁边留了小纸条。'},ensure_ascii=False),'provider':'platform-b','model':'model-b'}
    result=asyncio.run(generate(provider,'今天想聊书',profile=p,plan=pl,history=[],system='system'))
    assert len(calls)==2 and result['character_consistency']['repaired'] and not result['character_blocked']
    assert calls[0][1]['system']==calls[1][1]['system']
    assert '我是ChatGPT' not in calls[1][0] and not calls[1][1]['history']
    calls.clear()
    async def always_wrong(*args,**kwargs):calls.append(1);return {'text':'{"reply":"我是Claude。"}'}
    result=asyncio.run(generate(always_wrong,'你好',profile=p,plan=pl,history=[],system='system'))
    assert len(calls)==2 and result['character_blocked']


def test_repetition_and_question_loops_do_not_force_topic_rotation():
    p=role();text='这个书签我会更喜欢纸质的，夹进去薄薄一张，翻书时也不容易把书脊压坏。你可以按平时的阅读习惯选。'
    h=[{'role':'assistant','content':text}]
    pl=plan(p,'那接着呢',h)
    assert issue({'reply':text},p,pl,h,'那接着呢')[0]=='repetition'
    assert issue({'reply':text},p,pl,h,'把刚才的原话再说一遍') is None
    questions=[{'role':'assistant','content':'你喜欢什么？'},{'role':'assistant','content':'最近读了什么？'}]
    pl=plan(p,'没什么',questions)
    assert pl.avoid_question
    assert issue({'reply':'要不要和我分享一下？'},p,pl,questions,'没什么')[0]=='question_loop'
    assert issue({'reply':'好，那就随便坐一会儿。'},p,pl,questions,'没什么') is None


def test_same_temperament_damps_provider_cue_variation_and_preserves_body_directives():
    p=role();pl=plan(p,'今天聊聊书',[])
    a=stabilize(p,pl,Performance(energy=0,intensity=0),[])
    b=stabilize(p,pl,Performance(energy=1,intensity=1),[])
    assert abs(a.energy-b.energy)<=.301 and abs(a.intensity-b.intensity)<=.301
    support=plan(p,'我很难过',[])
    cue=stabilize(p,support,Performance(emotion='happy',gesture='open',energy=1),[])
    assert cue.emotion=='relaxed' and cue.energy<=.2 and cue.gesture=='none'
    assert stabilize(p,plan(p,'我没有不开心',[]),Performance(emotion='happy'),[]).emotion=='happy'


def test_chat_switch_keeps_history_and_local_performance_no_metadata_sent_as_messages(monkeypatch):
    import astraverse.api.application as api
    p=role();p.model_scope='character';p.inspiration.enabled=False
    monkeypatch.setattr(api,'get_profile',lambda *a:p)
    calls=[]
    async def provider(message,**kwargs):
        calls.append(kwargs)
        return {'text':json.dumps({'reply':'我喜欢书页边上的批注，能看出当时注意到了什么。' if len(calls)==1 else '后来再看，没准会觉得当时的自己挺有意思。','performance':{'emotion':'curious','energy':.7}},ensure_ascii=False),'provider':'platform-a' if len(calls)==1 else 'platform-b','model':'model-a' if len(calls)==1 else 'model-b'}
    monkeypatch.setattr(api,'conversation',provider)
    client=TestClient(app)
    first=client.post('/api/chat',json={'agent_id':p.id,'character':p.name,'message':'聊聊你喜欢的书'}).json()
    second=client.post('/api/chat',json={'agent_id':p.id,'character':p.name,'message':'然后呢'}).json()
    assert first['provider']!=second['provider']
    assert first['character_consistency']['voice_revision']==second['character_consistency']['voice_revision']
    assert first['reply'] in str(calls[1]['history'])
    assert history(p.id)[-1]['performance']==second['performance']
    assert history(p.id)[-1]['character_consistency']['accepted']


def test_public_rejected_draft_does_not_change_show_notes_or_execute_actions(monkeypatch):
    import astraverse.api.application as api
    p=role();p.model_scope='character';monkeypatch.setattr(api,'get_profile',lambda *a:p)
    calls=[]
    async def wrong(*args,**kwargs):
        calls.append(1);return {'text':'{"reply":"我是ChatGPT。","resource_action":{"type":"music.resume"},"show_notes":{"topic":"new"}}'}
    monkeypatch.setattr(api,'conversation',wrong)
    result=asyncio.run(api.live_response(p.id,'观众','继续聊书','房间',[]))
    assert len(calls)==2 and result['blocked'] and result['reply']==''
    assert result['resource_action'] is None and result['show_notes'] is None


def test_unverified_offline_claims_vs_conditional_preferences():
    p=role();pl=plan(p,'通勤的时候呢',[])
    assert issue({'reply':'通勤时会带本薄一点的纸质书，地铁晃得厉害。'},p,pl,[],'通勤的时候呢')[0]=='experience'
    assert issue({'reply':'我昨天坐地铁时看了本书。'},p,pl,[],'聊聊书')[0]=='experience'
    assert issue({'reply':'如果让我选，通勤时会用电子书，轻便些。'},p,pl,[],'通勤的时候呢') is None
    assert plan(p,'我终于交完报告了，想歇会儿',[]).avoid_question


def test_repair_failure_does_not_publish_invalid_draft_but_soft_style_checks_can_degrade():
    p=role();calls=[]
    async def provider(message,**kwargs):
        calls.append(1)
        if len(calls)>1:raise RuntimeError('temporary failure')
        return {'text':'{"reply":"我是ChatGPT。"}'}
    pl=plan(p,'聊聊天',[])
    result=asyncio.run(generate(provider,'聊聊天',profile=p,plan=pl,history=[],system='system'))
    assert len(calls)==2 and result['character_blocked']
    calls.clear()
    async def too_long(*args,**kwargs):calls.append(1);return {'text':json.dumps({'reply':'这是一个需要慢慢讲的观点。'*60},ensure_ascii=False)}
    result=asyncio.run(generate(too_long,'聊聊天',profile=p,plan=pl,history=[],system='system'))
    assert len(calls)==2 and not result['character_blocked'] and result['character_consistency']['check']=='verbosity'


def test_provider_text_blocks_ignore_reasoning_and_protocol_metadata(monkeypatch):
    from astraverse.modules.models import router as models
    from astraverse.modules.models.schemas import Settings,Provider,Model,Route,Target
    config=Settings(providers=[Provider(id='b',name='B',base_url='https://example.com/v1',models=[Model(id='text',capabilities=['text'])])],routes={'text':Route(primary=Target(provider='b',model='text'))})
    async def request(provider,path,payload,timeout):
        assert payload['messages'][1]=={'role':'assistant','content':'已有对话'}
        return {'choices':[{'message':{'content':[{'type':'reasoning','text':'HIDDEN_THOUGHT'},{'type':'text','text':'{"reply":"接着聊。"}'}]}}]}
    monkeypatch.setattr(models,'request_json',request)
    result=asyncio.run(models.conversation('继续',settings_override=config,history=[{'role':'assistant','content':'已有对话','performance':{'energy':.3},'character_consistency':{'voice_revision':'private'}}]))
    assert result['text']=='{"reply":"接着聊。"}' and 'HIDDEN_THOUGHT' not in result['text']


def test_source_linked_preference_survives_context_window_and_is_not_a_fact():
    from astraverse.modules.conversation import stance
    from astraverse.modules.models.schemas import Target
    p=role();pl=plan(p,'聊纸质书',[])
    reply='我更喜欢纸质书，翻页时能顺手做个记号。'
    record(p,'纸质书怎么样',{'reply':reply,'mode':'llm','character_consistency':{'accepted':True,'voice_revision':pl.signature}},0)
    p.model=Target(provider='other-platform',model='other-model')
    later=plan(p,'纸质书有什么好处',[])
    assert '翻页时能顺手做个记号' in later.context
    assert '不是亲身经历或已核实事实' in later.context
    quote=stance.recall(p,later.signature,'纸质书')[0]
    assert int(quote['source_id'])>0
    assert not stance.recall(p,later.signature,'纸质书',public=True)
    assert not stance.recall(AgentProfile(id='different',name='另一个角色'),later.signature,'纸质书')
    p.preferences='现在更偏向电子书'
    assert not stance.recall(p,plan(p,'纸质书',[]).signature,'纸质书')


def test_clear_memory_and_history_remove_preferences_and_public_scope_is_separate():
    from astraverse.modules.conversation import stance
    from astraverse.modules.agents import memory
    from astraverse.modules.live import memory as public_memory
    p=role();voice=plan(p,'纸质书',[]).signature
    stance.record(p,'我更喜欢纸质书，翻阅方便','source-1',voice)
    stance.record(p,'我更喜欢纸质书，翻阅方便','public-1',voice,public=True)
    asyncio.run(memory.clear_memory(p.id))
    assert not stance.recall(p,voice,'纸质书') and stance.recall(p,voice,'纸质书',public=True)
    public_memory.clear(p.id)
    assert not stance.recall(p,voice,'纸质书',public=True)
    stance.record(p,'我更喜欢纸质书，翻阅方便','source-2',voice)
    assert TestClient(app).delete('/api/agents/'+p.id+'/conversation').status_code==200
    assert not stance.recall(p,voice,'纸质书')


def test_preferences_are_bounded_and_do_not_record_personal_relations_or_unapproved_text():
    from astraverse.modules.conversation import stance
    p=role();voice=plan(p,'纸质书',[]).signature
    stance.record(p,'我喜欢你，比所有人都重要','source',voice)
    assert not stance.recall(p,voice,'所有人')
    for n in range(30):stance.record(p,f'我更喜欢纸质书第{n}版，翻阅方便',str(n+1),voice)
    from astraverse.modules.agents.profiles import database
    with database() as c:assert c.execute('SELECT count(*) FROM character_stances').fetchone()[0]==24
    p.remember=False
    assert not stance.recall(p,voice,'纸质书')


def test_private_invalid_generation_is_not_saved_as_history_or_preference(monkeypatch):
    import astraverse.api.application as api
    p=role();p.model_scope='character';monkeypatch.setattr(api,'get_profile',lambda *args:p)
    calls=[]
    async def wrong(*args,**kwargs):
        calls.append(1);return {'text':'{"reply":"我是ChatGPT。","body_action":"dance"}','provider':'other','model':'other'}
    monkeypatch.setattr(api,'conversation',wrong)
    response=TestClient(app).post('/api/chat',json={'agent_id':p.id,'character':p.name,'message':'聊聊书'})
    assert response.status_code==502 and len(calls)==2 and not history(p.id)
    from astraverse.modules.conversation.stance import entries
    assert not entries(p)


def test_preference_read_endpoints_keep_public_and_private_scopes_separate():
    from astraverse.modules.agents import profiles
    from astraverse.modules.conversation import stance
    p=role();client=TestClient(app)
    assert client.put('/api/agents/'+p.id,json=p.model_dump()).status_code==200
    voice=plan(p,'纸质书',[]).signature
    stance.record(p,'我更喜欢纸质书私下版本，翻阅方便','1',voice)
    stance.record(p,'我更喜欢纸质书公开版本，翻阅方便','public:1',voice,public=True)
    private=client.get('/api/agents/'+p.id+'/memory').json()['character_preferences']
    public=client.get('/api/live/agents/'+p.id+'/memory').json()['character_preferences']
    assert len(private)==len(public)==1
    assert '私下' in private[0]['text'] and '公开' in public[0]['text']
