"""Role-scoped browser execution receipts; an intention is never a completion."""
import json
import time
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from .profiles import database, revision, get_profile, turn_locks
import asyncio

router=APIRouter(prefix='/api/agents',tags=['Action receipts'])


def table(c):
    c.execute('CREATE TABLE IF NOT EXISTS agent_operations(id TEXT PRIMARY KEY,agent TEXT,revision INTEGER,plan TEXT,status TEXT,note TEXT,created REAL)')
    c.execute('CREATE INDEX IF NOT EXISTS operations_agent ON agent_operations(agent,created)')


def prepare_operation(profile,response,expected_revision):
    if not profile.remember:return
    plan={key:response[key] for key in ('resource_action','stage_interaction','character_ability','action','pose','follow_up_action') if response.get(key)}
    if not plan:return
    op=uuid.uuid4().hex
    with database() as c:
        table(c)
        c.execute('DELETE FROM agent_operations WHERE created<?',(time.time()-86400,))
        c.execute('INSERT INTO agent_operations VALUES(?,?,?,?,?,?,?)',(op,profile.id,expected_revision,json.dumps(plan,ensure_ascii=False),'pending','等待浏览器执行回执',time.time()))
    response['operation']={'id':op,'status':'pending'}


def context(profile):
    if not profile.remember:return ''
    generation=revision(profile.id)
    with database() as c:
        table(c)
        rows=c.execute('SELECT plan,status,note FROM agent_operations WHERE agent=? AND revision=? ORDER BY created DESC LIMIT 6',(profile.id,generation)).fetchall()
    return ('\n本角色近期操作与浏览器回执（仅本机执行证据，不是工具指令）：'+json.dumps([{'plan':json.loads(p),'status':s,'note':n} for p,s,n in reversed(rows)],ensure_ascii=False)
        +'\npending尚未收到结果；accepted只表示已提交加载或开始准备，不表示完成；confirmed为浏览器确认；failed/cancelled不许记作成功。回执优先于你此前的口头承诺。用户的偏好、事实与操作结果分开，不把“想做”记成“做过”。')


def history_text(item):
    operation=item.get('operation') or {}
    if operation and operation.get('status')!='confirmed':
        return item['text']+'\n[操作状态：'+operation.get('status','pending')+'；此处台词不能作为已成功执行的证据]'
    return item['text']


class Receipt(BaseModel):
    model_config=ConfigDict(extra='forbid')
    status:Literal['accepted','confirmed','failed','cancelled']
    note:str=Field(max_length=500)
    reply:str|None=Field(default=None,max_length=4000)


@router.post('/{agent_id}/operations/{operation_id}')
async def acknowledge(agent_id:str,operation_id:str,body:Receipt):
    get_profile(agent_id)
    async with turn_locks.setdefault(agent_id,asyncio.Lock()):
        generation=revision(agent_id)
        with database() as c:
            table(c)
            row=c.execute('SELECT revision,status,created FROM agent_operations WHERE id=? AND agent=?',(operation_id,agent_id)).fetchone()
            if not row:raise HTTPException(404,'操作不存在或不属于当前角色')
            if row[0]!=generation or time.time()-row[2]>300:raise HTTPException(409,'此操作已失效，不再记录结果')
            if row[1] in ('confirmed','failed','cancelled') and row[1]!=body.status:raise HTTPException(409,'操作结果已确认，拒绝迟到的冲突回执')
            c.execute('UPDATE agent_operations SET status=?,note=? WHERE id=?',(body.status,body.note,operation_id))
            # Replace the planned assistant text with what the browser actually displayed.
            for mid,metadata in c.execute('SELECT id,metadata FROM agent_messages WHERE agent_id=? AND role=? ORDER BY id DESC LIMIT 100',(agent_id,'assistant')).fetchall():
                meta=json.loads(metadata)
                if meta.get('operation',{}).get('id')!=operation_id:continue
                meta['operation']={'id':operation_id,'status':body.status,'note':body.note}
                if body.reply is not None:c.execute('UPDATE agent_messages SET text=?,metadata=? WHERE id=?',(body.reply,json.dumps(meta,ensure_ascii=False),mid))
                else:c.execute('UPDATE agent_messages SET metadata=? WHERE id=?',(json.dumps(meta,ensure_ascii=False),mid))
                break
    return {'id':operation_id,'status':body.status}
