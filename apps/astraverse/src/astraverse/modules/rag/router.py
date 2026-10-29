import asyncio
import json
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, ConfigDict, Field
from astraverse.modules.agents import profiles
from . import store,service,embedding
from .extract import extract

router=APIRouter(prefix='/api/rag',tags=['Retrieval augmented knowledge'])

class RagSettings(BaseModel):
    model_config=ConfigDict(extra='forbid')
    enabled:bool=True
    semantic_enabled:bool=False
    top_k:int=Field(default=6,ge=1,le=10)
    min_similarity:float=Field(default=.5,ge=0,le=1)

@router.get('/settings')
async def get_settings():
    configured=False;model=None
    try:_,provider,model,_=embedding.target();configured=True
    except Exception:pass
    return {**service.settings(),'embedding_configured':configured,'embedding_model':model}

@router.put('/settings')
async def save_settings(body:RagSettings):
    if body.enabled and body.semantic_enabled:
        try:embedding.target()
        except Exception as exc:raise HTTPException(409,'请先在平台能力路由中配置“向量检索”模型') from exc
    with profiles.database() as c:
        store.prepare(c);c.execute('INSERT OR REPLACE INTO rag_settings VALUES(1,?)',(body.model_dump_json(),))
    if not body.enabled or not body.semantic_enabled:
        for task in list(service.jobs.values()):task.cancel()
        with profiles.database() as c:c.execute("UPDATE rag_documents SET status='lexical_ready' WHERE status='embedding'")
    return await get_settings()

@router.get('/status')
async def index_status():
    service.migrate_books()
    with profiles.database() as c:
        store.prepare(c)
        rows=c.execute('SELECT id,resource_id,title,kind,status,error,generation,vector_key FROM rag_documents').fetchall()
        counts=dict(c.execute('SELECT document,count(*) FROM rag_chunks GROUP BY document').fetchall())
    fingerprint=None
    try:fingerprint=embedding.target()[3]
    except Exception:pass
    return {'documents':[{'id':r[0],'resource_id':r[1],'title':r[2],'kind':r[3],'status':'needs_reindex' if r[4]=='ready' and r[7]!=fingerprint else r[4],'error':r[5],'chunks':counts.get(r[0],0)} for r in rows],'jobs':len([t for t in service.jobs.values() if not t.done()])}

@router.put('/documents/{resource_id}/file')
async def upload(resource_id:str,request:Request,filename:str=Query(max_length=240),title:str=Query(min_length=1,max_length=180)):
    if not resource_id or len(resource_id)>120:raise HTTPException(422,'资源ID无效')
    raw=bytearray()
    async for part in request.stream():
        if len(raw)+len(part)>20*1024*1024:raise HTTPException(413,'可检索文件不能超过20MB')
        raw.extend(part)
    doc_id='book:'+resource_id
    try:
        sections=await asyncio.to_thread(extract,bytes(raw),filename)
        # A text-only document replacement must not leave the previous readable book active.
        if filename.rsplit('.',1)[-1].lower() not in ('txt','md','epub'):
            from astraverse.modules.resources.reading import prepare
            with profiles.database() as c:
                prepare(c)
                c.execute('DELETE FROM books WHERE id=?',(resource_id,))
                c.execute('DELETE FROM book_progress WHERE book=?',(resource_id,))
                c.execute('DELETE FROM book_readers WHERE book=?',(resource_id,))
                store.upsert(doc_id,title,sections,resource_id=resource_id,connection=c)
            changed=True
        else:changed=store.upsert(doc_id,title,sections,resource_id=resource_id)
    except HTTPException as exc:
        from astraverse.modules.resources.reading import delete_book
        await delete_book(resource_id)
        store.upsert(doc_id,title,[],resource_id=resource_id)
        row=service.document(doc_id)
        if row:store.mark(doc_id,row[0],'unsupported',str(exc.detail))
        raise
    queued=service.schedule(doc_id)
    return {'indexed':True,'changed':changed,'mode':'fulltext','semantic_queued':queued}

@router.delete('/documents/{resource_id}')
async def delete(resource_id:str):
    service.invalidate('book:'+resource_id)
    return {'deleted':True}

class Search(BaseModel):
    model_config=ConfigDict(extra='forbid')
    agent_id:str=Field(min_length=1,max_length=120,pattern=r'^[a-zA-Z0-9_-]+$')
    query:str=Field(min_length=1,max_length=1200)
    public:bool=False

@router.post('/search')
async def search(body:Search):
    result=await service.retrieve(profiles.get_profile(body.agent_id),body.query,public=body.public)
    return {k:v for k,v in result.items() if k!='context'}

@router.get('/chunks/{chunk_id}')
async def source(chunk_id:str,agent_id:str=Query(min_length=1,max_length=120),public:bool=False):
    profile=profiles.get_profile(agent_id)
    rows=store.get_chunks([chunk_id]);allowed=store.allowed_documents(profile.id,public)
    if not rows or rows[0]['document'] not in allowed:raise HTTPException(404,'来源已删除或无权查看')
    row=rows[0];doc=allowed[row['document']]
    if doc['generation']!=row['generation']:raise HTTPException(404,'来源版本已失效')
    return {'title':doc['title'],'section':row['section'],'text':row['text'],'position':json.loads(row['position']),'resource_id':doc['resource_id'] or None}

@router.post('/reindex')
async def reindex():
    service.migrate_books()
    for profile in {p.id:p for p in [*profiles.DEFAULTS,*profiles.saved_profiles().values()]}.values():service.sync_profile(profile)
    with profiles.database() as c:
        store.prepare(c);ids=[r[0] for r in c.execute("SELECT id FROM rag_documents WHERE status!='unsupported'")]
    queued=sum(bool(service.schedule(doc_id,True)) for doc_id in ids)
    return {'scheduled':queued,'documents':len(ids),'mode':'hybrid' if service.settings()['semantic_enabled'] else 'fulltext'}
