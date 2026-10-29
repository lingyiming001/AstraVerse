"""Local resource catalog and per-character visibility shared by chat and live."""
import json
from fastapi import APIRouter
from pydantic import BaseModel, Field
from astraverse.modules.agents.profiles import database
from .selection import ResourceSummary

router = APIRouter(prefix='/api/library', tags=['Resource access'])

def db():
    return database()

def prepare(connection):
    connection.execute('CREATE TABLE IF NOT EXISTS resource_access (id TEXT PRIMARY KEY, agents TEXT NOT NULL)')
    connection.execute('CREATE TABLE IF NOT EXISTS resource_catalog (id TEXT PRIMARY KEY, data TEXT NOT NULL)')

def permissions():
    with db() as connection:
        prepare(connection)
        return {key:json.loads(value) for key,value in connection.execute('SELECT id,agents FROM resource_access')}

def visible(resources, agent_id):
    access=permissions()
    return [r for r in resources if r.id not in access or agent_id in access[r.id]]

class Access(BaseModel):
    # None means shared; an empty list means no character can access it.
    agents:list[str]|None=Field(default=None,max_length=200)

@router.get('/access')
async def access_list():return permissions()

@router.put('/access/{resource_id}')
async def access_save(resource_id:str, body:Access):
    with db() as connection:
        prepare(connection)
        if body.agents is None:connection.execute('DELETE FROM resource_access WHERE id=?',(resource_id,))
        else:connection.execute('INSERT OR REPLACE INTO resource_access VALUES (?,?)',(resource_id,json.dumps(body.agents)))
    return {'saved':True}

class Catalog(BaseModel):
    resources:list[ResourceSummary]=Field(max_length=200)

@router.put('/catalog')
async def catalog_save(body:Catalog):
    with db() as connection:
        prepare(connection)
        connection.execute('DELETE FROM resource_catalog')
        connection.executemany('INSERT INTO resource_catalog VALUES (?,?)',[(r.id,r.model_dump_json()) for r in body.resources])
        from astraverse.modules.rag.store import prepare as rag_prepare
        rag_prepare(connection)
        from astraverse.modules.rag.store import rename
        for r in body.resources:
            if r.kind=='book':rename('book:'+r.id,r.name,connection)
    return {'saved':True}

def live_catalog(agent_id):
    with db() as connection:
        prepare(connection)
        rows=[ResourceSummary.model_validate_json(value) for (value,) in connection.execute('SELECT data FROM resource_catalog')]
    # Private resources can inform private chat, but never enter public livestreams.
    private=permissions()
    return [r for r in rows if r.id not in private and r.kind in ('music','book')]
