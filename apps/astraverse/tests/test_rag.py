import asyncio
import io
import json
import zipfile
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.agents import profiles
from astraverse.modules.agents.profiles import AgentProfile, KnowledgeEntry
from astraverse.modules.rag import store, service, vectors, embedding
from astraverse.modules.rag.extract import extract, sections_from_text, chunks
from astraverse.modules.resources import reading, library


def profile(id='reader'):
    return AgentProfile(id=id,name='测试')


def search(query='海棠花',agent='reader',public=False):
    return asyncio.run(service.retrieve(profile(agent),query,public=public))


def test_full_book_tail_chapter_sources_and_replacement():
    text='第一回 开始\n'+'窗外春雨。'*1600+'\n第一百二十回 结局\n海棠花最终送给了青衣。'
    reading.store('novel','原文',text)
    result=search('海棠花送给谁')
    assert result['mode']=='fulltext'
    hit=next(s for s in result['sources'] if '海棠花' in s['excerpt'])
    assert hit['position']['offset']>5000 and '结局' in hit['section']
    old_id=hit['id']
    reading.store('novel','新原文','新一版只有梅花。')
    assert not store.get_chunks([old_id])
    assert not search('海棠花')['sources']
    assert '梅花' in search('梅花')['sources'][0]['excerpt']


def test_private_resources_prefilter_and_public_role_knowledge():
    reading.store('shared','共享书','海棠花公开答案。')
    reading.store('secret','私有书','海棠花私有答案。')
    with profiles.database() as c:
        library.prepare(c)
        c.execute('INSERT INTO resource_access(id,agents) VALUES(?,?)',('secret',json.dumps(['reader'])))
    assert len(search()['sources'])==2
    assert all(s['resource_id']!='secret' for s in search(agent='other')['sources'])
    assert all(s['resource_id']!='secret' for s in search(public=True)['sources'])
    p=profile();p.knowledge=[KnowledgeEntry(title='私有设定',content='咖啡秘方'),KnowledgeEntry(title='公开设定',content='咖啡历史',public=True)]
    private=asyncio.run(service.retrieve(p,'咖啡'))
    public=asyncio.run(service.retrieve(p,'咖啡',public=True))
    assert len(private['sources'])==2 and len(public['sources'])==1
    assert public['sources'][0]['title']=='公开设定'
    assert not search('咖啡',agent='other')['sources']


def test_semantic_synonym_hybrid_qdrant_and_deleted_vectors(monkeypatch):
    p=profile();reading.store('sleep','休息','熄灯后喝杯温水，安心入睡。')
    async def fake(texts):return [[1.,0.,0.] for text in texts],'test'
    monkeypatch.setattr(embedding,'embed',fake)
    monkeypatch.setattr(embedding,'target',lambda:(None,None,'test','test'))
    with profiles.database() as c:c.execute('INSERT INTO rag_settings VALUES(1,?)',(json.dumps({**service.DEFAULTS,'semantic_enabled':True}),))
    async def run():
        assert service.schedule('book:sleep')
        await asyncio.gather(*list(service.jobs.values()))
        result=await service.retrieve(p,'失眠怎么办')
        assert result['mode']=='hybrid' and result['sources'][0]['resource_id']=='sleep'
        assert vectors.search('test',[1.,0.,0.],store.allowed_documents(p.id),.5)
        service.invalidate('book:sleep')
        assert not vectors.search('test',[1.,0.,0.],store.allowed_documents(p.id),.5)
        assert not store.get_chunks([result['sources'][0]['id']])
    asyncio.run(run())


def test_permissions_revalidated_after_embedding_await(monkeypatch):
    reading.store('one','测试','海棠花原文')
    with profiles.database() as c:c.execute('INSERT INTO rag_settings VALUES(1,?)',(json.dumps({**service.DEFAULTS,'semantic_enabled':True}),))
    async def revoke(texts):
        with profiles.database() as c:
            library.prepare(c);c.execute('INSERT INTO resource_access(id,agents) VALUES(?,?)',('one',json.dumps(['other'])))
        return [[1.,0.]],'test'
    monkeypatch.setattr(embedding,'embed',revoke)
    monkeypatch.setattr(service,'schedule',lambda *a,**k:False)
    assert not search()['sources']


def test_parse_subtitles_docx_blank_pdf_and_chunk_bounds():
    subtitles=extract(b'WEBVTT\n\n00:01.000 --> 00:03.000\nhello world\n\n','a.vtt')
    assert subtitles[0]['position']=={'time':1.,'time_end':3.}
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="urn:w"><w:p><w:r><w:t>海棠花</w:t></w:r></w:p></w:document>')
    assert extract(buffer.getvalue(),'a.docx')[0]['text']=='海棠花'
    from pypdf import PdfWriter
    pdf=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=300,height=300);writer.write(pdf)
    with pytest.raises(HTTPException,match='OCR'):extract(pdf.getvalue(),'a.pdf')
    pieces=list(chunks(sections_from_text('字'*4000)))
    assert all(len(c[0])<=900 for c in pieces) and pieces[-1][2]['end']==4000


def test_source_endpoint_deleted_or_unauthorized_and_settings():
    client=TestClient(app)
    reading.store('one','标题','海棠花')
    hit=search()['sources'][0]
    assert client.get('/api/rag/chunks/'+hit['id'],params={'agent_id':'reader'}).status_code==200
    assert client.put('/api/rag/settings',json={**service.DEFAULTS,'semantic_enabled':True}).status_code==409
    assert client.delete('/api/library/books/one').status_code==200
    assert client.get('/api/rag/chunks/'+hit['id'],params={'agent_id':'reader'}).status_code==404


def test_clear_chat_memory_removes_index_and_does_not_resurrect():
    from astraverse.modules.agents.memory import table, clear_memory
    p=profile()
    with profiles.database() as c:
        table(c)
        c.execute('INSERT INTO agent_memory_facts(agent_id,text,source_ids) VALUES(?,?,?)',(p.id,'喜欢海棠花','[1]'))
    service.sync_profile(p)
    assert search()['sources']
    asyncio.run(clear_memory(p.id))
    assert not search()['sources']


def test_embedding_validation_and_rewrite(monkeypatch):
    monkeypatch.setattr(embedding,'target',lambda:(type('Config',(),{'timeout':1})(),None,'test','test'))
    async def invalid(*args):return {'data':[{'index':0,'embedding':[float('nan'),1]}]}
    monkeypatch.setattr(embedding.models,'request_json',invalid)
    with pytest.raises(ValueError,match='数值'):asyncio.run(embedding.embed(['query']))
    value=service.rewrite('她后来呢',[{'role':'assistant','content':'不存在的书名'},{'role':'user','content':'海棠花送谁'}])
    assert '海棠花' in value and '不存在的书名' not in value


def test_clear_public_memory_deletes_rag_from_correct_database():
    from astraverse.modules.live import memory as live_memory, archive
    p=profile();sid=archive.begin(p.id,'test');event=archive.record(sid,'viewer','记住我喜欢研究海棠花')
    assert live_memory.remember(p,'记住我喜欢研究海棠花',sid,event)
    assert search(public=True)['sources']
    live_memory.clear(p.id)
    # The live archive and the RAG index use separate databases.
    assert not store.allowed_documents(p.id,public=True)
    assert not search(public=True)['sources']


def test_chat_and_live_use_real_evidence_and_return_references(monkeypatch):
    import astraverse.api.application as api
    p=profile();p.model_scope='character';p.auto_summary=False;p.inspiration.enabled=False
    reading.store('one','后半部原文','第一百回 结局\n海棠花最终送给了青衣。')
    monkeypatch.setattr(api,'get_profile',lambda *args:p)
    async def model(*args,**kwargs):
        assert '海棠花最终送给了青衣' in kwargs['system']
        return {'text':json.dumps({'reply':'原文写的是送给青衣。'},ensure_ascii=False),'provider':'test','model':'test'}
    monkeypatch.setattr(api,'conversation',model)
    client=TestClient(app)
    result=client.post('/api/chat',json={'agent_id':p.id,'message':'海棠花送给谁','character':'测试'}).json()
    assert result['sources'][0]['title']=='后半部原文'
    assert 'excerpt' not in result['sources'][0]
    assert profiles.history(p.id)[-1]['sources'][0]['id']==result['sources'][0]['id']
    live=asyncio.run(api.live_response(p.id,'观众','海棠花送给谁','房间',[]))
    assert live['sources'][0]['title']=='后半部原文'
    async def revoked(*args,**kwargs):
        with profiles.database() as c:
            library.prepare(c);c.execute('INSERT INTO resource_access VALUES(?,?)',('one',json.dumps(['other'])))
        return {'text':json.dumps({'reply':'原文写的是送给青衣。'}),'provider':'test','model':'test'}
    monkeypatch.setattr(api,'conversation',revoked)
    assert client.post('/api/chat',json={'agent_id':p.id,'message':'海棠花送给谁','character':'测试'}).status_code==409
    assert not profiles.history(p.id)[-1].get('sources')


def test_replacing_book_with_invalid_file_removes_old_source_and_reader():
    client=TestClient(app);reading.store('one','标题','海棠花')
    response=client.put('/api/rag/documents/one/file',params={'filename':'broken.pdf','title':'坏文件'},content=b'not a PDF')
    assert response.status_code==422
    assert not search()['sources']
    with profiles.database() as c:assert not c.execute('SELECT 1 FROM books WHERE id="one"').fetchone()
    doc=next(d for d in client.get('/api/rag/status').json()['documents'] if d['resource_id']=='one')
    assert doc['status']=='unsupported' and doc['chunks']==0


def test_embedding_platform_route_and_connection_probe(monkeypatch):
    from astraverse.modules.models import router as models
    client=TestClient(app)
    config={'providers':[{'id':'embed','name':'Embedding','base_url':'https://embedding.example/v1','models':[{'id':'test-embedding','capabilities':['embedding']}]}], 'routes':{'embedding':{'primary':{'provider':'embed','model':'test-embedding'},'fallbacks':[]}}}
    assert client.put('/api/models/settings',json=config).status_code==200
    async def request(provider,path,payload,timeout):
        assert path=='/embeddings' and payload['model']=='test-embedding'
        return {'data':[{'index':i,'embedding':[1.,0.,0.]} for i,_ in enumerate(payload['input'])]}
    monkeypatch.setattr(models,'request_json',request)
    assert client.get('/api/rag/settings').json()['embedding_configured']
    result=client.post('/api/models/infer',json={'capability':'embedding','prompt':'测试向量连接'})
    assert result.status_code==200 and '3维' in result.json()['text']
    assert client.put('/api/rag/settings',json={**service.DEFAULTS,'semantic_enabled':True}).status_code==200


def test_cancelled_old_embedding_cannot_restore_deleted_document(monkeypatch):
    reading.store('one','标题','海棠花')
    with profiles.database() as c:c.execute('INSERT INTO rag_settings VALUES(1,?)',(json.dumps({**service.DEFAULTS,'semantic_enabled':True}),))
    monkeypatch.setattr(embedding,'target',lambda:(None,None,'test','test'))
    writes=[]
    monkeypatch.setattr(vectors,'upsert',lambda *args:writes.append(args))
    async def run():
        started=asyncio.Event()
        async def delayed(texts):
            started.set()
            try:await asyncio.sleep(30)
            except asyncio.CancelledError:pass
            return [[1.,0.]],'test'
        monkeypatch.setattr(embedding,'embed',delayed)
        service.schedule('book:one');task=next(iter(service.jobs.values()))
        await started.wait();service.invalidate('book:one');await task
        assert not writes and service.document('book:one') is None
    asyncio.run(run())


def test_profile_edit_immediately_invalidates_private_source():
    client=TestClient(app);p=profile()
    p.knowledge=[KnowledgeEntry(title='资料',content='海棠花原文',public=True)]
    assert client.put('/api/agents/'+p.id,json=p.model_dump()).status_code==200
    result=asyncio.run(service.retrieve(p,'海棠花',public=True));hit=result['sources'][0]
    p.knowledge[0].public=False
    assert client.put('/api/agents/'+p.id,json=p.model_dump()).status_code==200
    assert client.get('/api/rag/chunks/'+hit['id'],params={'agent_id':p.id,'public':True}).status_code==404
    p.knowledge=[]
    assert client.put('/api/agents/'+p.id,json=p.model_dump()).status_code==200
    assert not store.get_chunks([hit['id']])


def test_rename_updates_search_title_without_invalidating_content_references():
    reading.store('one','旧的名字','实际正文与文章内容。')
    generation=service.document('book:one')[0]
    client=TestClient(app)
    result=client.put('/api/library/catalog',json={'resources':[{'id':'one','kind':'book','name':'苍山游记','description':''}]})
    assert result.status_code==200
    hit=search('苍山游记')['sources'][0]
    assert hit['title']=='苍山游记' and hit['generation']==generation
