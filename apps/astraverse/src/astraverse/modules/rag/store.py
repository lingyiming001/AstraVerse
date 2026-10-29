import hashlib
import json
import re
import sqlite3
import uuid
from astraverse.modules.agents.profiles import database

STOP=re.compile(r'为什么|怎么回事|是什么|请问|告诉我|解释一下|资料库|这本书|这个|那个|一下|里面|中的|如何|以及|我们|你们|什么')


def tokens(text,query=False):
    text=STOP.sub(' ',text) if query else text
    result=re.findall(r'[a-z0-9_]{2,}',text.lower())
    for phrase in re.findall(r'[\u4e00-\u9fff]+',text):
        if len(phrase)==1:result.append(phrase)
        for size in (2,3):result.extend(phrase[i:i+size] for i in range(len(phrase)-size+1))
    return list(dict.fromkeys(result))


def prepare(c):
    c.execute('CREATE TABLE IF NOT EXISTS rag_documents(id TEXT PRIMARY KEY,kind TEXT,owner TEXT,public INTEGER,resource_id TEXT,title TEXT,version TEXT,generation TEXT,status TEXT,error TEXT,vector_key TEXT DEFAULT "")')
    c.execute('CREATE TABLE IF NOT EXISTS rag_chunks(id TEXT UNIQUE,document TEXT,generation TEXT,text TEXT,section TEXT,position TEXT)')
    c.execute('CREATE INDEX IF NOT EXISTS rag_doc_chunks ON rag_chunks(document)')
    c.execute('CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(tokens,tokenize="unicode61")')
    c.execute('CREATE TABLE IF NOT EXISTS rag_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT)')


def delete_document(doc_id,c=None):
    if c is None:
        with database() as connection:delete_document(doc_id,connection)
        return
    prepare(c)
    c.execute('DELETE FROM rag_fts WHERE rowid IN (SELECT rowid FROM rag_chunks WHERE document=?)',(doc_id,))
    c.execute('DELETE FROM rag_chunks WHERE document=?',(doc_id,))
    c.execute('DELETE FROM rag_documents WHERE id=?',(doc_id,))


def delete_owned(agent,kinds,c=None):
    if c is None:
        with database() as connection:delete_owned(agent,kinds,connection)
        return
    prepare(c)
    for (doc_id,) in c.execute('SELECT id FROM rag_documents WHERE owner=? AND kind IN ('+','.join('?' for _ in kinds)+')',(agent,*kinds)).fetchall():delete_document(doc_id,c)


def rename(doc_id,title,c):
    prepare(c)
    row=c.execute('SELECT title FROM rag_documents WHERE id=?',(doc_id,)).fetchone()
    if not row or row[0]==title:return
    c.execute('UPDATE rag_documents SET title=? WHERE id=?',(title,doc_id))
    for rowid,section,text in c.execute('SELECT rowid,section,text FROM rag_chunks WHERE document=?',(doc_id,)).fetchall():
        c.execute('UPDATE rag_fts SET tokens=? WHERE rowid=?',(' '.join(tokens(title+' '+section+' '+text)),rowid))


def upsert(doc_id,title,sections,*,kind='book',owner='',public=True,resource_id='',connection=None):
    if connection is None:
        with database() as c:return upsert(doc_id,title,sections,kind=kind,owner=owner,public=public,resource_id=resource_id,connection=c)
    c=connection;prepare(c)
    signature=hashlib.sha256(json.dumps(sections,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    old=c.execute('SELECT version,generation FROM rag_documents WHERE id=?',(doc_id,)).fetchone()
    if old and old[0]==signature:
        rename(doc_id,title,c)
        c.execute('UPDATE rag_documents SET public=?,owner=? WHERE id=?',(int(public),owner,doc_id));return False
    if old:
        from .vectors import delete
        try:delete(doc_id,old[1])
        except Exception:
            import logging
            logging.getLogger(__name__).warning('Old RAG vectors retained; generation filter excludes them')
    delete_document(doc_id,c);generation=uuid.uuid4().hex
    c.execute('INSERT INTO rag_documents VALUES(?,?,?,?,?,?,?,?,?,?,?)',(doc_id,kind,owner,int(public),resource_id,title,signature,generation,'lexical_ready','',''))
    from .extract import chunks
    for index,(text,section,position) in enumerate(chunks(sections)):
        if index>=20000:raise ValueError('单份资料最多20000个片段')
        chunk_id=str(uuid.uuid5(uuid.NAMESPACE_URL,doc_id+'\0'+generation+'\0'+str(index)))
        row=c.execute('INSERT INTO rag_chunks VALUES(?,?,?,?,?,?)',(chunk_id,doc_id,generation,text,section,json.dumps(position,ensure_ascii=False)))
        c.execute('INSERT INTO rag_fts(rowid,tokens) VALUES(?,?)',(row.lastrowid,' '.join(tokens(title+' '+section+' '+text))))
    return True


def allowed_documents(agent,public=False):
    from astraverse.modules.resources.library import permissions
    access=permissions()
    with database() as c:
        prepare(c)
        rows=c.execute('SELECT id,kind,owner,public,resource_id,title,version,generation,status,error,vector_key FROM rag_documents').fetchall()
    result={}
    for row in rows:
        doc=dict(zip(('id','kind','owner','public','resource_id','title','version','generation','status','error','vector_key'),row))
        if doc['owner'] and doc['owner']!=agent:continue
        if public and not doc['public']:continue
        if doc['kind']=='book' and doc['resource_id'] in access and (public or agent not in access[doc['resource_id']]):continue
        result[doc['id']]=doc
    return result


def lexical(query,allowed,limit=40):
    words=tokens(query,True)[:48]
    if not words or not allowed:return []
    match=' OR '.join('"'+word.replace('"','""')+'"' for word in words)
    ids=list(allowed)
    with database() as c:
        prepare(c)
        # Permissions participate in the SQL query before ranking/limiting results.
        rows=c.execute('SELECT ch.id,ch.document,ch.generation,ch.text,ch.section,ch.position,bm25(rag_fts) AS rank FROM rag_fts JOIN rag_chunks ch ON ch.rowid=rag_fts.rowid WHERE rag_fts MATCH ? AND ch.document IN ('+','.join('?' for _ in ids)+') ORDER BY rank LIMIT ?',(match,*ids,limit)).fetchall()
    return [dict(zip(('id','document','generation','text','section','position','rank'),r)) for r in rows]


def rows_for_document(doc_id,generation):
    with database() as c:
        prepare(c)
        return [dict(zip(('id','text','section'),row)) for row in c.execute('SELECT id,text,section FROM rag_chunks WHERE document=? AND generation=? ORDER BY rowid',(doc_id,generation))]


def get_chunks(ids):
    if not ids:return []
    with database() as c:
        prepare(c)
        rows=c.execute('SELECT id,document,generation,text,section,position FROM rag_chunks WHERE id IN ('+','.join('?' for _ in ids)+')',ids).fetchall()
    return [dict(zip(('id','document','generation','text','section','position'),r)) for r in rows]


def mark(doc_id,generation,status,error='',vector_key=''):
    with database() as c:
        prepare(c);c.execute('UPDATE rag_documents SET status=?,error=?,vector_key=? WHERE id=? AND generation=?',(status,error[:180],vector_key,doc_id,generation))


def current(doc_id,generation):
    with database() as c:
        prepare(c);return bool(c.execute('SELECT 1 FROM rag_documents WHERE id=? AND generation=?',(doc_id,generation)).fetchone())
