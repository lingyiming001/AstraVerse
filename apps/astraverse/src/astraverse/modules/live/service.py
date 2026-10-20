"""Live chat channels: authenticated Twitch IRC and token-protected local bridges."""
from __future__ import annotations
import asyncio
import contextlib
import hashlib
import json
import os
import re
import secrets
import ssl
import tempfile
import time
import uuid
from collections import deque
from pathlib import Path
from astraverse.core.paths import DATA_DIR
from typing import Any, Literal
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator

router=APIRouter(prefix='/api/live',tags=['Live chat'])
FILE=DATA_DIR / 'live.json'
PLATFORMS=[{'id':key,'name':name,'direct':key=='twitch'} for key,name in [('bilibili','哔哩哔哩'),('douyin','抖音直播'),('douyu','斗鱼'),('huya','虎牙'),('youtube','YouTube Live'),('twitch','Twitch'),('custom','其他平台')]]
class Channel(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(default_factory=lambda:uuid.uuid4().hex,pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    name:str=Field(min_length=1,max_length=60)
    platform:Literal['bilibili','douyin','douyu','huya','youtube','twitch','custom']='bilibili'
    room:str=Field(min_length=1,max_length=120)
    transport:Literal['bridge','twitch']='bridge'
    username:str=Field(default='',max_length=40)
    oauth:str=Field(default='',max_length=256)
    agent_id:str|None=Field(default=None,pattern=r'^[a-zA-Z0-9_-]{1,120}$')
    cooldown:int=Field(default=12,ge=5,le=120)
    keyword:str=Field(default='',max_length=40)
    voice:bool=True
    send_to_platform:bool=False
    @field_validator('name','room')
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError('不能为空')
        return v.strip()
class Binding(BaseModel):
    model_config=ConfigDict(extra='forbid')
    agent_id:str|None=Field(default=None,pattern=r'^[a-zA-Z0-9_-]{1,120}$')
class Danmaku(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=120)
    user:str=Field(min_length=1,max_length=80)
    text:str=Field(min_length=1,max_length=500)
    room:str=Field(min_length=1,max_length=120)
    is_self:bool=False
class Runtime:
    def __init__(self):
        self.status='stopped';self.error='';self.queue=asyncio.Queue(maxsize=20)
        self.events=deque(maxlen=80);self.seen=deque(maxlen=500);self.outbox=deque(maxlen=100);self.turns=deque(maxlen=6)
        self.worker=None;self.connection=None;self.writer=None;self.last_reply=0.;self.revision=0
runtime:dict[str,Runtime]={}
config_lock=asyncio.Lock()
chat_handler=None
notify=None
inference_limit=asyncio.Semaphore(2)
twitch_send_lock=asyncio.Lock()
last_twitch_send=0.

def load():
    if not FILE.exists():return {}
    try:
        data=json.loads(FILE.read_text())
        if not isinstance(data,dict) or len(data)>30:raise ValueError()
        for key,row in data.items():
            c=Channel.model_validate({k:v for k,v in row.items() if k!='token'})
            if c.id!=key or not isinstance(row.get('token'),str):raise ValueError()
        return data
    except (ValueError,OSError):raise HTTPException(503,'直播配置无法读取')
def save(data):
    FILE.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=FILE.parent,prefix='.live-')
    try:
        with os.fdopen(fd,'w') as f:json.dump(data,f,ensure_ascii=False)
        os.replace(tmp,FILE)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def channel(cid):
    data=load()
    if cid not in data:raise HTTPException(404,'直播间不存在')
    return data[cid]
def rt(cid):return runtime.setdefault(cid,Runtime())
def public(row):
    state=rt(row['id'])
    return {**{k:v for k,v in row.items() if k not in ('oauth','token')},'has_oauth':bool(row.get('oauth')),'status':state.status,'error':state.error,'queued':state.queue.qsize()}
async def emit(cid,event):
    event={**event,'at':time.time(),'channel_id':cid}
    rt(cid).events.append(event)
    if notify:await notify({'type':'live_event','channel_id':cid,'event':event})
@router.get('')
async def index():return {'platforms':PLATFORMS,'channels':[public(c) for c in load().values()]}
@router.put('/channels/{cid}')
async def update(cid:str,body:Channel):
    if cid!=body.id:raise HTTPException(422,'ID不一致')
    if body.transport=='twitch' and (body.platform!='twitch' or not re.fullmatch(r'[a-zA-Z0-9_]{1,25}',body.room) or not re.fullmatch(r'[a-zA-Z0-9_]{1,25}',body.username)):
        raise HTTPException(422,'Twitch直连需有效频道名和机器人用户名（字母、数字、下划线）')
    await stop(cid)
    async with config_lock:
        data=load()
        if cid not in data and len(data)>=30:raise HTTPException(409,'最多配置30个直播间')
        previous=data.get(cid,{})
        row=body.model_dump();row['oauth']=body.oauth or previous.get('oauth','');row['token']=previous.get('token') or secrets.token_urlsafe(32)
        if '\n' in row['oauth'] or '\r' in row['oauth']:raise HTTPException(422,'令牌含无效字符')
        data[cid]=row;save(data)
    return public(row)
@router.delete('/channels/{cid}')
async def delete(cid:str):
    await stop(cid)
    async with config_lock:
        data=load();data.pop(cid,None);save(data)
    runtime.pop(cid,None)
    return {'deleted':True}
@router.put('/channels/{cid}/binding')
async def bind(cid:str,body:Binding):
    async with config_lock:
        data=load();row=channel(cid);row['agent_id']=body.agent_id;data[cid]=row;save(data)
        state=rt(cid);state.revision+=1;state.turns.clear();state.outbox.clear()
        while not state.queue.empty():state.queue.get_nowait();state.queue.task_done()
    return public(row)
@router.get('/channels/{cid}/events')
async def events(cid:str):channel(cid);return {'events':list(rt(cid).events),'channel':public(channel(cid))}
@router.post('/channels/{cid}/bridge-config')
async def bridge_config(cid:str):
    row=channel(cid)
    return {'endpoint':f'http://127.0.0.1:8000/api/live/channels/{cid}/incoming','authorization':'Bearer '+row['token'],'outbox':f'http://127.0.0.1:8000/api/live/channels/{cid}/outbox','payload':{'id':'platform-message-id','user':'观众昵称','text':'你好','room':row['room'],'is_self':False}}
def authenticate(row,authorization):
    if not authorization or not secrets.compare_digest(authorization,'Bearer '+row['token']):raise HTTPException(401,'弹幕桥接令牌无效')
@router.post('/channels/{cid}/incoming')
async def incoming(cid:str,body:Danmaku,authorization:str|None=Header(default=None)):
    row=channel(cid);authenticate(row,authorization)
    if row['transport']!='bridge':raise HTTPException(409,'该直播间使用Twitch直连')
    return await enqueue(cid,body)
@router.get('/channels/{cid}/outbox')
async def outbox(cid:str,after:int=0,authorization:str|None=Header(default=None)):
    row=channel(cid);authenticate(row,authorization)
    enabled=row['send_to_platform'] and rt(cid).status in ('waiting','connected') and bool(row['agent_id'])
    return {'replies':[item for item in rt(cid).outbox if item['sequence']>after] if enabled else [], 'send_enabled':enabled}
async def enqueue(cid,event:Danmaku):
    row=channel(cid);state=rt(cid)
    if state.status not in ('waiting','connected'):raise HTTPException(409,'请先启动弹幕互动')
    if event.room!=row['room']:raise HTTPException(422,'房间号不匹配')
    if event.is_self or event.id in state.seen:return {'accepted':False,'reason':'self-or-duplicate'}
    state.seen.append(event.id)
    await emit(cid,{'kind':'danmaku','user':event.user,'text':event.text})
    if row['keyword'] and row['keyword'] not in event.text:return {'accepted':False,'reason':'keyword'}
    if not row['agent_id']:return {'accepted':False,'reason':'unbound'}
    if state.queue.full():return {'accepted':False,'reason':'queue-full'}
    state.queue.put_nowait((event,time.monotonic(),state.revision))
    if row['transport']=='bridge':state.status='connected'
    return {'accepted':True,'queued':state.queue.qsize()}
async def worker(cid):
    state=rt(cid)
    while True:
        event,created,revision=await state.queue.get()
        try:
            row=channel(cid)
            await asyncio.sleep(max(0,row['cooldown']-(time.monotonic()-state.last_reply)))
            if revision!=state.revision or time.monotonic()-created>90:continue
            aid=row['agent_id']
            if not aid:continue
            state.last_reply=time.monotonic()
            async with inference_limit:
                result=await chat_handler(aid,event.user,event.text,row['name'],list(state.turns))
            if revision!=state.revision or aid!=channel(cid)['agent_id']:continue
            text=result['reply'][:1200]
            state.turns.extend([{'role':'user','content':json.dumps({'viewer':event.user,'danmaku':event.text},ensure_ascii=False)},{'role':'assistant','content':text}])
            await emit(cid,{'kind':'reply','user':event.user,'text':text,'agent_id':aid,'performance':result.get('performance'),'voice':row['voice'],'mode':result.get('mode')})
            if row['send_to_platform']:
                if row['transport']=='twitch' and state.writer:
                    global last_twitch_send
                    async with twitch_send_lock:
                        await asyncio.sleep(max(0,2.1-(time.monotonic()-last_twitch_send)))
                        part=('[AI] '+re.sub(r'[\x00-\x1f]+',' ',text)).encode()[:440].decode('utf-8',errors='ignore')
                        state.writer.write(f'PRIVMSG #{row["room"].lower()} :{part}\r\n'.encode());await state.writer.drain()
                        last_twitch_send=time.monotonic()
                    await emit(cid,{'kind':'delivery','text':'回复已提交Twitch；不代表平台送达确认。'})
                else:
                    sequence=max(int(time.time()*1000),(state.outbox[-1]['sequence']+1) if state.outbox else 0)
                    state.outbox.append({'sequence':sequence,'id':uuid.uuid4().hex,'agent_id':aid,'reply_to':event.id,'text':text,'created':time.time()})
        except asyncio.CancelledError:raise
        except Exception:
            await emit(cid,{'kind':'error','text':'本次回复失败，请检查角色模型配置、网络或平台授权。'})
        finally:state.queue.task_done()
async def twitch(cid):
    state=rt(cid);attempt=0
    while True:
        try:
            row=channel(cid)
            reader,writer=await asyncio.wait_for(asyncio.open_connection('irc.chat.twitch.tv',6697,ssl=ssl.create_default_context(),limit=65536),timeout=20)
            state.writer=writer
            token=row['oauth'];token=token if token.startswith('oauth:') else 'oauth:'+token
            for line in [f'PASS {token}',f'NICK {row["username"].lower()}','CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands',f'JOIN #{row["room"].lower()}']:
                writer.write((line+'\r\n').encode())
            await writer.drain()
            while True:
                raw=await asyncio.wait_for(reader.readline(),timeout=30 if state.status=='connecting' else 240)
                if not raw:raise ConnectionError()
                line=raw.decode(errors='replace').strip()
                if line.startswith('PING'):
                    writer.write((line.replace('PING','PONG',1)+'\r\n').encode());await writer.drain();continue
                if 'Login authentication failed' in line or 'Improperly formatted auth' in line:
                    state.status='error';state.error='Twitch授权失败，请更新OAuth令牌和用户名';return
                if re.search(r' JOIN #| 366 ',line):state.status='connected';state.error='';attempt=0
                match=re.search(r':([\w]+)![^ ]+ PRIVMSG #([\w]+) :(.*)',line)
                if match:
                    if match[1].lower()==row['username'].lower():continue
                    tags=dict(part.split('=',1) for part in line.split(' ',1)[0].lstrip('@').split(';') if '=' in part) if line.startswith('@') else {}
                    mid=tags.get('id') or hashlib.sha256(raw).hexdigest()
                    await enqueue(cid,Danmaku(id=mid,user=tags.get('display-name') or match[1],text=match[3][:500],room=row['room']))
                if ' RECONNECT' in line:raise ConnectionError()
        except asyncio.CancelledError:raise
        except Exception:
            state.status='reconnecting';state.error='连接中断，正在重试';attempt+=1
        finally:
            if state.writer:
                state.writer.close()
                with contextlib.suppress(Exception):await asyncio.wait_for(state.writer.wait_closed(),timeout=3)
                state.writer=None
        await asyncio.sleep(min(60,2**min(attempt,6)))
@router.post('/channels/{cid}/start')
async def start(cid:str):
    row=channel(cid)
    if not row['agent_id']:raise HTTPException(409,'请先在聊天框绑定角色')
    if row['transport']=='twitch' and not row['oauth']:raise HTTPException(409,'请先配置Twitch OAuth令牌')
    await stop(cid);state=rt(cid);state.status='waiting';state.error=''
    state.worker=asyncio.create_task(worker(cid))
    if row['transport']=='twitch':state.status='connecting';state.connection=asyncio.create_task(twitch(cid))
    return public(row)
@router.post('/channels/{cid}/stop')
async def stop_endpoint(cid:str):channel(cid);await stop(cid);return public(channel(cid))
async def stop(cid):
    state=rt(cid);state.revision+=1
    for task in (state.worker,state.connection):
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):await task
    state.worker=None;state.connection=None;state.status='stopped';state.outbox.clear();state.turns.clear()
    while not state.queue.empty():state.queue.get_nowait();state.queue.task_done()
async def shutdown():
    for cid in list(runtime):await stop(cid)
