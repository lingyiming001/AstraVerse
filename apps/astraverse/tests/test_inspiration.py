import asyncio
import json
import pytest
from astraverse.modules.agents import inspiration as module
from astraverse.modules.agents.profiles import AgentProfile
from astraverse.modules.resources.selection import ResourceSummary


def profile():
    return AgentProfile(id='a',name='A',background='PUBLIC_BACKGROUND',personality='喜欢音乐与幻想',model_scope='character',inspiration={'enabled':True,'interval_minutes':30})


def test_collect_is_opt_in_and_sources_are_role_bound(monkeypatch):
    monkeypatch.setattr(module,'schedule',lambda *args:False)
    p=profile()
    module.collect(p,'想听一个音乐故事','可以想象月亮变成音符',[ResourceSummary(id='b',kind='book',name='BOOK',excerpt='BOOK_EXCERPT')])
    data=module.state('a')
    assert any(s['kind']=='book_excerpt' and not s['public'] for s in data['sources'])
    assert module.state('b')['sources']==[]
    p.remember=False;before=len(data['sources']);module.collect(p,'新话题','回应',[])
    assert len(module.state('a')['sources'])==before
    p.remember=True;module.collect(p,'不要记住这个密码','不保存',[])
    assert len(module.state('a')['sources'])==before


def test_reflection_separates_private_inputs_and_keeps_provenance(monkeypatch):
    import astraverse.modules.agents.profiles as profiles
    import astraverse.modules.models.router as models
    p=profile();monkeypatch.setattr(module,'schedule',lambda *args:False)
    module.collect(p,'PRIVATE_INTERACTION','私密故事',[])
    monkeypatch.setattr(profiles,'get_profile',lambda aid:p)
    calls=[]
    async def model(message,**kwargs):
        payload=json.loads(message);calls.append(payload)
        sid=payload['sources'][0]['id']
        return {'text':json.dumps({'notes':[{'kind':'fiction','title':'旋律月亮','text':'在虚构故事里，月亮收集音符。','source_ids':[sid]}]},ensure_ascii=False)}
    monkeypatch.setattr(models,'conversation',model)
    asyncio.run(module.organize('a',0,0))
    assert len(calls)==2 and 'PRIVATE_INTERACTION' not in str(calls[0])
    assert 'PRIVATE_INTERACTION' in str(calls[1])
    notes=module.state('a')['notes'];assert len(notes)==2
    assert {n['public'] for n in notes}=={True,False}
    assert len(json.loads(module.context(p,'月亮',public=True).split('：',1)[1].split('\n')[0]))==1
    source_ids={s['id'] for s in module.state('a')['sources']}
    assert all(set(n['source_ids'])<=source_ids for n in notes)


def test_invalid_sources_not_saved_and_forget_wins_against_late_model(monkeypatch):
    import astraverse.modules.agents.profiles as profiles
    import astraverse.modules.models.router as models
    p=profile();monkeypatch.setattr(module,'schedule',lambda *args:False)
    module.collect(p,'音乐','回应',[]);monkeypatch.setattr(profiles,'get_profile',lambda aid:p)
    async def invalid(*args,**kwargs):return {'text':json.dumps({'notes':[{'kind':'idea','title':'x','text':'无来源','source_ids':[999999]}]})}
    monkeypatch.setattr(models,'conversation',invalid)
    asyncio.run(module.organize('a',0,0));assert module.state('a')['notes']==[]
    module.collect(p,'新的话题','新的回应',[])
    async def late(message,**kwargs):
        payload=json.loads(message);module.forget('a')
        return {'text':json.dumps({'notes':[{'kind':'idea','title':'x','text':'晚到','source_ids':[payload['sources'][0]['id']]}]})}
    monkeypatch.setattr(models,'conversation',late)
    asyncio.run(module.organize('a',0,0))
    assert module.state('a')['notes']==[] and module.state('a')['sources']==[]


def test_model_failure_does_not_overwrite_notes(monkeypatch):
    import astraverse.modules.agents.profiles as profiles
    import astraverse.modules.models.router as models
    p=profile();monkeypatch.setattr(module,'schedule',lambda *args:False)
    module.collect(p,'音乐','回应',[]);monkeypatch.setattr(profiles,'get_profile',lambda aid:p)
    async def fail(*args,**kwargs):raise RuntimeError('offline')
    monkeypatch.setattr(models,'conversation',fail)
    asyncio.run(module.organize('a',0,0))
    assert all(not s['processed'] for s in module.state('a')['sources'])


def test_schedule_respects_interval_and_no_work(monkeypatch):
    p=profile()
    assert not module.schedule(p)
    with module.database() as db:
        module.table(db)
        db.execute('INSERT INTO inspiration_sources(agent_id,kind,text,public,fingerprint) VALUES(?,?,?,?,?)',('a','interaction','x',0,'x'))
        import time
        db.execute('INSERT INTO inspiration_state(agent_id,last_attempt) VALUES(?,?)',('a',time.time()))
    assert not module.schedule(p)
