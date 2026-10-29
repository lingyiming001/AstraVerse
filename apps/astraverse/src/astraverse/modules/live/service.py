"""Authorized platform chat adapters and token-protected local bridges."""
from __future__ import annotations
import asyncio
import httpx
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
from difflib import SequenceMatcher
from astraverse.modules.live.content import blocked_output, compact
from astraverse.modules.live.routine import phase
from astraverse.modules.live.awareness import live_timing, session_program
from astraverse.modules.live import archive
from .platforms.common import OAuth, PlatformError, checked
from .platforms.youtube import YouTube, video_id
from .platforms.bilibili import Bilibili
from astraverse.modules.conversation.policy import prohibited
from collections import deque
from pathlib import Path
from astraverse.core.paths import DATA_DIR
from typing import Any, Literal
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator

router=APIRouter(prefix='/api/live',tags=['Live chat'])
FILE=DATA_DIR / 'live.json'
PLATFORMS=[{'id':key,'name':name,'direct':key in ('twitch','youtube','bilibili')} for key,name in [('bilibili','哔哩哔哩'),('douyin','抖音直播'),('douyu','斗鱼'),('huya','虎牙'),('youtube','YouTube Live'),('twitch','Twitch'),('custom','其他平台')]]
class Credentials(BaseModel):
    model_config=ConfigDict(extra='forbid')
    client_id:str=Field(default='',max_length=256)
    client_secret:str=Field(default='',max_length=2048)
    refresh_token:str=Field(default='',max_length=4096)
    app_id:str=Field(default='',max_length=32)
    access_key:str=Field(default='',max_length=256)
    access_secret:str=Field(default='',max_length=2048)
    identity_code:str=Field(default='',max_length=256)
    @field_validator('*')
    @classmethod
    def clean(cls,v):
        if any(ord(c)<32 for c in v):raise ValueError('授权信息含无效控制字符')
        return v.strip()
class Channel(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(default_factory=lambda:uuid.uuid4().hex,pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    name:str=Field(min_length=1,max_length=60)
    platform:Literal['bilibili','douyin','douyu','huya','youtube','twitch','custom']='bilibili'
    room:str=Field(min_length=1,max_length=120)
    transport:Literal['bridge','twitch','youtube','bilibili','local']='bridge'
    youtube_mode:Literal['stream','poll']='stream'
    username:str=Field(default='',max_length=40)
    oauth:str=Field(default='',max_length=4096)
    credentials:Credentials=Field(default_factory=Credentials)
    @field_validator('oauth')
    @classmethod
    def clean_oauth(cls,v):
        if any(ord(c)<32 for c in v):raise ValueError('令牌含无效控制字符')
        return v.strip()
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
        self.events=deque(maxlen=80);self.seen=deque(maxlen=500);self.outbox=deque(maxlen=100);self.turns=deque(maxlen=120)
        self.solo=None
        self.show_notes=None
        self.playback={}
        self.adapter=None;self.send_lock=asyncio.Lock()
        self.worker=None;self.connection=None;self.writer=None;self.last_reply=0.;self.revision=0
        self.metrics={'received':0,'queued':0,'replies':0,'failed':0,'expired':0,'filtered':0,'latency_ms':0,'proactive':0,'blocked':0,'interrupted':0,'idle_skipped':0}
        self.last_viewer=time.monotonic();self.last_idle_attempt=0.;self.idle_count=0;self.activity_revision=0
        self.idle_generation=None;self.fiction=deque(maxlen=6);self.idle_index=0
        self.idle_enabled=False;self.idle_limit=3
        self.archive_id=None;self.poll=None
        self.moderation_seen=deque(maxlen=500)
        self.session_started=time.monotonic();self.last_published=0.
        self.daily_started=None;self.daily_attempts=0;self.daily_state=None;self.daily_key=None
runtime:dict[str,Runtime]={}
config_lock=asyncio.Lock()
chat_handler=None
idle_handler=None
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
    return {**{k:v for k,v in row.items() if k not in ('oauth','token','credentials')},'credentials':{k:v for k,v in row.get('credentials',{}).items() if k in ('client_id','app_id')},'credential_status':{k:bool(v) for k,v in row.get('credentials',{}).items()},'has_oauth':bool(row.get('oauth')),'status':state.status,'error':state.error,'queued':state.queue.qsize(),'metrics':dict(state.metrics),'poll':public_poll(state.poll),'solo':solo_status(state),'autonomy':{'enabled':state.idle_enabled,'count':state.idle_count,'limit':state.idle_limit,'generating':state.idle_generation is not None,'daily':state.daily_state,'elapsed_seconds':max(0,int(time.monotonic()-state.session_started)) if state.status in ('waiting','connecting','connected','reconnecting') else 0}}
async def emit(cid,event):
    event={**event,'at':time.time(),'channel_id':cid}
    rt(cid).events.append(event)
    if notify:await notify({'type':'live_event','channel_id':cid,'event':event})
@router.get('')
async def index():return {'platforms':PLATFORMS,'channels':[public(c) for c in load().values()]}
@router.put('/channels/{cid}')
async def update(cid:str,body:Channel):
    if body.transport=='local':raise HTTPException(422,'本地测试请使用直播模式入口')
    if cid!=body.id:raise HTTPException(422,'ID不一致')
    if body.transport=='twitch' and (body.platform!='twitch' or not re.fullmatch(r'[a-zA-Z0-9_]{1,25}',body.room) or not re.fullmatch(r'[a-zA-Z0-9_]{1,25}',body.username)):
        raise HTTPException(422,'Twitch直连需有效频道名和机器人用户名（字母、数字、下划线）')
    if body.transport!='bridge' and body.transport!=body.platform:raise HTTPException(422,'直连接入方式与平台不一致')
    if body.transport=='bilibili' and body.send_to_platform:raise HTTPException(422,'B站开放平台仅接收消息，请使用本地语音/字幕回应')
    if body.transport=='youtube':
        try:video_id(body.room)
        except PlatformError as exc:raise HTTPException(422,str(exc))
    await stop(cid)
    async with config_lock:
        data=load()
        if cid not in data and len(data)>=30:raise HTTPException(409,'最多配置30个直播间')
        previous=data.get(cid,{})
        row=body.model_dump()
        same=previous.get('platform')==body.platform
        row['oauth']=body.oauth or (previous.get('oauth','') if same else '')
        row['credentials']={k:v or (previous.get('credentials',{}).get(k,'') if same else '') for k,v in row['credentials'].items()}
        row['token']=previous.get('token') or secrets.token_urlsafe(32)
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
        state=rt(cid);archive.end(state.archive_id);state.archive_id=None;state.poll=None
        state.revision+=1;state.turns.clear();state.outbox.clear();state.fiction.clear()
        state.last_viewer=time.monotonic();state.idle_count=0;state.idle_index=0
        state.daily_started=None;state.daily_attempts=0;state.daily_state=None;state.daily_key=None
        state.session_started=time.monotonic();state.last_published=0.;state.moderation_seen.clear()
        if state.idle_generation:state.idle_generation.cancel()
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
    if row['transport']!='bridge':raise HTTPException(409,'该直播间使用平台直连')
    return await enqueue(cid,body)
@router.get('/channels/{cid}/outbox')
async def outbox(cid:str,after:int=0,authorization:str|None=Header(default=None)):
    row=channel(cid);authenticate(row,authorization)
    enabled=row['transport']=='bridge' and row['send_to_platform'] and rt(cid).status in ('waiting','connected') and bool(row['agent_id'])
    return {'replies':[item for item in rt(cid).outbox if item['sequence']>after] if enabled else [], 'send_enabled':enabled}
async def enqueue(cid,event:Danmaku):
    row=channel(cid);state=rt(cid)
    if state.status not in ('waiting','connected'):raise HTTPException(409,'请先启动弹幕互动')
    if event.room!=row['room']:raise HTTPException(422,'房间号不匹配')
    if event.is_self or event.id in state.seen:return {'accepted':False,'reason':'self-or-duplicate'}
    state.seen.append(event.id)
    if row['agent_id']:
        team=profile_team(row['agent_id'])
        if team.moderation_enabled:
            reason=moderate_event(state,event,team)
            if reason:
                state.metrics['filtered']+=1
                await emit(cid,{'kind':'moderation','text':'弹幕管理已跳过一条消息：'+reason})
                return {'accepted':False,'reason':'moderation'}
    state.last_viewer=time.monotonic();state.activity_revision+=1;state.idle_count=0
    if state.idle_generation:
        state.metrics['interrupted']+=1
        state.idle_generation.cancel()
    await emit(cid,{'kind':'danmaku','user':event.user,'text':event.text})
    state.metrics['received']+=1
    await finish_poll(cid)
    if state.poll and state.poll['open'] and re.fullmatch(r'[1-4]',event.text.strip()):
        index=int(event.text.strip())-1
        if index<len(state.poll['options']):
            state.poll['votes'][event.user.casefold()]=index
            return {'accepted':True,'reason':'vote'}
    if state.poll and not state.poll['open'] and re.fullmatch(r'[1-4]',event.text.strip()):
        return {'accepted':False,'reason':'poll-ended'}
    if row['keyword'] and row['keyword'] not in event.text:
        state.metrics['filtered']+=1
        return {'accepted':False,'reason':'keyword'}
    if not row['agent_id']:return {'accepted':False,'reason':'unbound'}
    if state.queue.full():
        state.metrics['filtered']+=1
        return {'accepted':False,'reason':'queue-full'}
    state.queue.put_nowait((event,time.monotonic(),state.revision))
    state.metrics['queued']+=1
    if row['transport']=='bridge':state.status='connected'
    return {'accepted':True,'queued':state.queue.qsize()}
async def worker(cid):
    state=rt(cid)
    while True:
        try:
            event,created,revision=await asyncio.wait_for(state.queue.get(),timeout=2)
        except asyncio.TimeoutError:
            try:
                await finish_poll(cid)
                await maybe_idle(cid)
                if state.solo and state.status=='stopped':return
            except asyncio.CancelledError:raise
            except Exception:
                state.last_idle_attempt=time.monotonic()
                state.metrics['failed']+=1
                if state.solo:
                    state.solo['failures']=state.solo.get('failures',0)+1
                    if state.solo['failures']>=3:
                        await end_solo(cid,'model-error','自主主持连续失败3次，测试已停止，请检查模型和网络。');return
                await emit(cid,{'kind':'error','text':'主动主持暂不可用，请检查角色模型与节目配置。'})
            continue
        try:
            await finish_poll(cid)
            row=channel(cid)
            await asyncio.sleep(max(0,row['cooldown']-(time.monotonic()-state.last_reply)))
            if revision!=state.revision or time.monotonic()-created>90:
                state.metrics['expired']+=1
                continue
            aid=row['agent_id']
            if not aid:continue
            program=session_program(profile_program(aid),state.solo)
            if program.daily.enabled:
                daily=await daily_status(cid,program)
                if daily['reason'] in ('rest','ended'):
                    state.metrics['filtered']+=1
                    continue
            state.last_reply=time.monotonic()
            started=time.monotonic()
            async with inference_limit:
                with live_timing(state):
                    result=await chat_handler(aid,event.user,event.text,row['name'],list(state.turns))
            if revision!=state.revision or aid!=channel(cid)['agent_id']:continue
            state.metrics['latency_ms']=round((time.monotonic()-started)*1000)
            await publish(cid,aid,result,event.user,event.id,revision=revision,message=event.text)
        except asyncio.CancelledError:raise
        except Exception:
            state.metrics['failed']+=1
            await emit(cid,{'kind':'error','text':'本次回复失败，请检查角色模型配置、网络或平台授权。'})
        finally:state.queue.task_done()
def validate_credentials(row):
    transport=row['transport'];c=row.get('credentials',{})
    if transport in ('twitch','youtube'):
        if not row.get('oauth') and not c.get('refresh_token'):raise HTTPException(409,'请配置访问令牌或刷新授权')
        if c.get('refresh_token') and not all(c.get(k) for k in ('client_id','client_secret')):raise HTTPException(409,'刷新授权还需要Client ID和Client Secret')
    if transport=='bilibili':
        if not all(c.get(k) for k in ('app_id','access_key','access_secret','identity_code')) or not c['app_id'].isdigit():raise HTTPException(409,'请填写B站项目数字ID、Access Key、Access Secret与主播身份码')
        if not row['room'].isdigit():raise HTTPException(409,'B站请填写数字长房间号')
        if row['send_to_platform']:raise HTTPException(409,'B站官方接入仅接收弹幕，请关闭平台发言')

def token_persist(cid):
    async def persist(token,refresh,previous):
        async with config_lock:
            data=load();row=data.get(cid)
            if not row or row.get('credentials',{}).get('refresh_token')!=previous:return
            row['oauth']=token;row['credentials']['refresh_token']=refresh;save(data)
    return persist

async def twitch_auth(row,client,persist=None):
    auth=OAuth(row,'twitch',client,persist)
    await auth.headers()
    data=checked(await client.get('https://id.twitch.tv/oauth2/validate',headers={'Authorization':'OAuth '+auth.token}),'Twitch')
    if str(data.get('login','')).lower()!=row['username'].lower():raise PlatformError('Twitch令牌账号与机器人用户名不一致。',fatal=True)
    scopes=set(data.get('scopes',[]));required={'chat:read'} | ({'chat:edit'} if row['send_to_platform'] else set())
    if not required.issubset(scopes):raise PlatformError('Twitch令牌缺少chat:read或chat:edit授权。',fatal=True)
    auth.expires=min(auth.expires or float('inf'),time.monotonic()+min(3600,max(1,int(data.get('expires_in',3600))-(120 if auth.credentials.get('refresh_token') else 5))))
    return auth

@router.post('/channels/{cid}/check')
async def check_channel(cid:str):
    row=channel(cid);validate_credentials(row)
    if rt(cid).status not in ('stopped','error'):raise HTTPException(409,'请先停止互动再检查，避免并行刷新授权')
    if row['transport']=='bridge':return {'verified':False,'message':'配置可用；需外部桥接程序接收真实弹幕后验证。'}
    if row['transport']=='bilibili':return {'verified':False,'message':'配置完整。B站需启动互动创建官方场次，长连鉴权成功后才能验证授权；此检查未创建场次。'}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            if row['transport']=='twitch':await twitch_auth(row,client,token_persist(cid))
            else:await YouTube(row,client,token_persist(cid)).connect()
    except PlatformError as exc:raise HTTPException(409,str(exc))
    except Exception:raise HTTPException(502,'无法连接平台，请检查网络、TLS证书与代理设置')
    return {'verified':True,'message':'平台授权检查通过；尚需启动互动验证真实弹幕和发言权限。'}

async def native(cid):
    state=rt(cid);attempt=0
    async with httpx.AsyncClient(timeout=20) as client:
        row=channel(cid)
        adapter=(YouTube if row['transport']=='youtube' else Bilibili)(row,client,token_persist(cid))
        state.adapter=adapter
        async def ready():
            nonlocal attempt
            attempt=0;state.status='connected';state.error=''
            await emit(cid,{'kind':'control','text':'平台鉴权成功，已连接直播聊天。'})
        async def message(event):
            if state.status=='connected':await enqueue(cid,Danmaku(**event))
        while True:
            try:
                await adapter.listen(message,ready)
                raise PlatformError('平台连接已结束。')
            except asyncio.CancelledError:raise
            except Exception as exc:
                fatal=isinstance(exc,PlatformError) and exc.fatal
                state.status='error' if fatal else 'reconnecting'
                state.error=str(exc) if isinstance(exc,PlatformError) else '平台连接中断，请检查网络、TLS证书与代理。'
                await emit(cid,{'kind':'error','text':state.error})
                if fatal:return
                attempt+=1
                await asyncio.sleep(max(getattr(exc,'retry_after',5),min(60,2**min(attempt,6))))

async def twitch(cid):
    state=rt(cid);attempt=0
    while True:
        try:
            row=channel(cid)
            async with httpx.AsyncClient(timeout=20) as client:auth=await twitch_auth(row,client,token_persist(cid))
            reader,writer=await asyncio.wait_for(asyncio.open_connection('irc.chat.twitch.tv',6697,ssl=ssl.create_default_context(),limit=65536),timeout=20)
            state.writer=writer
            token='oauth:'+auth.token
            for line in [f'PASS {token}',f'NICK {row["username"].lower()}','CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands',f'JOIN #{row["room"].lower()}']:
                writer.write((line+'\r\n').encode())
            await writer.drain()
            while True:
                if time.monotonic()>=auth.expires:raise PlatformError('Twitch授权即将到期，正在重新验证。')
                raw=await asyncio.wait_for(reader.readline(),timeout=min(30 if state.status!='connected' else 240,max(1,auth.expires-time.monotonic())))
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
                if ' NOTICE ' in line and any(f'msg-id={code}' in line for code in ('msg_channel_suspended','msg_room_not_found','no_permission','invalid_nick')):
                    raise PlatformError('Twitch频道不可用或账号没有访问权限，请检查频道与授权。',fatal=True)
                if ' NOTICE ' in line:await emit(cid,{'kind':'delivery','text':'Twitch返回频道通知，请检查账号发言限制或频道规则。'})
                if ' RECONNECT' in line:raise ConnectionError()
        except asyncio.CancelledError:raise
        except PlatformError as exc:
            state.error=str(exc);state.status='error' if exc.fatal else 'reconnecting'
            if exc.fatal:return
            attempt+=1
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
    validate_credentials(row)
    if row['transport']=='local':raise HTTPException(409,'请使用直播模式按钮开始本地测试')
    await stop(cid);state=rt(cid);state.status='waiting';state.error=''
    state.last_viewer=time.monotonic();state.last_idle_attempt=0.;state.idle_count=0;state.idle_index=0
    state.daily_started=None;state.daily_attempts=0;state.daily_state=None;state.daily_key=None
    state.session_started=time.monotonic();state.last_published=0.;state.moderation_seen.clear()
    state.archive_id=archive.begin(row['agent_id'],cid)
    state.worker=asyncio.create_task(worker(cid))
    if row['transport']=='local':state.status='connected'
    elif row['transport']!='bridge':
        state.status='connecting';state.connection=asyncio.create_task(twitch(cid) if row['transport']=='twitch' else native(cid))
    return public(row)
@router.post('/channels/{cid}/stop')
async def stop_endpoint(cid:str):channel(cid);await stop(cid);return public(channel(cid))
async def stop(cid):
    state=rt(cid);state.revision+=1
    reading_agent=None
    if state.status in ('waiting','connecting','connected','reconnecting'):
        from astraverse.modules.resources.reading import pause_active
        row=load().get(cid,{})
        if row.get('agent_id') and pause_active(row['agent_id']):reading_agent=row['agent_id']
    for task in (state.worker,state.connection,state.idle_generation):
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):await task
    if state.poll and state.poll['open']:archive.record(state.archive_id,'poll_cancel','运营者暂停互动，未完成投票已取消，不产生胜出选项。')
    archive.end(state.archive_id);state.archive_id=None;state.poll=None
    if state.solo and not state.solo['reason']:state.solo['reason']='manual';state.solo['finished_at']=time.monotonic()
    state.adapter=None;state.worker=None;state.connection=None;state.status='stopped';state.outbox.clear();state.turns.clear();state.fiction.clear();state.idle_enabled=False
    state.idle_count=0;state.last_viewer=time.monotonic();state.daily_state=None;state.moderation_seen.clear();state.show_notes=None;state.playback.clear()
    while not state.queue.empty():state.queue.get_nowait();state.queue.task_done()
    await emit(cid,{'kind':'control','text':'互动已暂停，主动主持已停止。',**({'reading_agent_id':reading_agent} if reading_agent else {})})
async def shutdown():
    for cid in list(runtime):await stop(cid)


class SoloRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    agent_id:str=Field(pattern=r'^[a-zA-Z0-9_-]{1,120}$')
    duration_minutes:int=Field(default=60,ge=1,le=1440)
    interval:int=Field(default=45,ge=5,le=600)
    voice:bool=True

def solo_status(state):
    if not state.solo:return None
    solo=state.solo;now=solo.get('finished_at',time.monotonic())
    return {k:solo[k] for k in ('interval','duration_minutes','attempts','limit','reason')} | {
        'remaining_seconds':max(0,int(solo['deadline']-now)),
        'speaking':playback_active(state),
        'next_in_seconds':max(0,int(max(state.last_viewer,state.last_idle_attempt,state.last_reply)+solo.get('next_interval',solo['interval'])-now)),
        'generating':state.idle_generation is not None}

class PlaybackReport(BaseModel):
    model_config=ConfigDict(extra='forbid')
    client_id:str=Field(min_length=1,max_length=120)
    active:bool

def playback_active(state):
    now=time.monotonic()
    state.playback={key:deadline for key,deadline in state.playback.items() if deadline>now}
    return bool(state.playback)

@router.post('/channels/{cid}/playback')
async def report_playback(cid:str, body:PlaybackReport):
    channel(cid)
    state=rt(cid)
    playback_active(state)
    if body.active and state.status in ('waiting','connected'):
        state.playback[body.client_id]=time.monotonic()+90
    elif body.client_id in state.playback:
        del state.playback[body.client_id]
        if not state.playback:state.last_reply=time.monotonic()
    return {'speaking':playback_active(state)}

@router.post('/solo/start')
async def start_solo(body:SoloRequest):
    from astraverse.modules.agents.profiles import get_profile,profile_status
    profile=get_profile(body.agent_id)
    if profile_status(profile)['mode']!='llm':raise HTTPException(409,'持续自主直播需要可用的文本模型，请先在设置中配置角色或全局聊天模型')
    cid='solo-'+hashlib.sha256(body.agent_id.encode()).hexdigest()[:24]
    await stop(cid)
    row=Channel(id=cid,name='本地无人直播测试',platform='custom',transport='local',room=cid,
                agent_id=body.agent_id,cooldown=5,voice=body.voice,send_to_platform=False).model_dump()
    async with config_lock:
        data=load()
        if cid not in data and len(data)>=30:raise HTTPException(409,'直播间配置已达30个上限，请先清理不用的配置')
        row['token']=secrets.token_urlsafe(32);data[cid]=row;save(data)
    state=rt(cid);state.status='connected';state.error='';state.metrics={k:0 for k in state.metrics}
    now=time.monotonic();state.session_started=now;state.last_viewer=now-body.interval;state.last_idle_attempt=0.;state.last_reply=0.;state.last_published=0.
    state.idle_index=0;state.idle_count=0;state.seen.clear()
    state.solo={'interval':body.interval,'duration_minutes':body.duration_minutes,'deadline':now+body.duration_minutes*60,
                'attempts':0,'limit':body.duration_minutes*60//5+1,'reason':''}
    state.archive_id=archive.begin(body.agent_id,cid)
    await emit(cid,{'kind':'control','text':'本地直播模式已开启，无需观众发言；首个话题即将开始。'})
    state.worker=asyncio.create_task(worker(cid))
    return public(row)

async def end_solo(cid,reason,text):
    state=rt(cid)
    if not state.solo:return
    from astraverse.modules.resources.reading import pause_active
    aid=channel(cid).get('agent_id')
    reading_paused=pause_active(aid) if aid else False
    state.solo['reason']=reason;state.solo['finished_at']=time.monotonic();state.status='stopped';state.idle_enabled=False
    state.poll=None;state.revision+=1
    archive.end(state.archive_id);state.archive_id=None
    await emit(cid,{'kind':'control','text':text,**({'reading_agent_id':aid} if reading_paused else {})})

class Rehearsal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    agent_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,120}$')
    message: str = Field(default='冷场主持排练', min_length=1, max_length=500)
    kind: Literal['reply','knowledge','memory','dream'] = 'reply'


@router.post('/rehearsal')
async def rehearse(body: Rehearsal):
    if body.kind=='reply' and not body.message.strip():
        raise HTTPException(422, '模拟弹幕不能为空')
    started = time.monotonic()
    async with inference_limit:
        if body.kind == 'reply':
            result = await chat_handler(body.agent_id, '排练观众', body.message, '本地排练室', [])
        else:
            result = await idle_handler(body.agent_id, '本地排练室', [], body.kind, [])
    return {**result, 'elapsed_ms':round((time.monotonic()-started)*1000), 'delivery':'rehearsal-only'}


def profile_program(agent_id):
    from astraverse.modules.agents.profiles import get_profile
    return get_profile(agent_id).live_program


async def publish(cid, aid, result, viewer, reply_to=None, *, revision, activity=None, kind='reply', message=''):
    state=rt(cid)
    def current():
        row=channel(cid)
        return revision==state.revision and aid==row['agent_id'] and (activity is None or activity==state.activity_revision)
    if not current():return False
    if state.solo and (state.status!='connected' or time.monotonic()>=state.solo['deadline']):return False
    program=session_program(profile_program(aid),state.solo)
    if program.daily.enabled:
        current_daily=await daily_status(cid,program)
        if current_daily['reason'] in ('rest','ended'):return False
    if not current():return False
    raw=result.get('reply','')
    if result.get('blocked') or blocked_output(raw,program):
        state.metrics['blocked']+=1
        await emit(cid,{'kind':'moderation','text':'一条角色发言未通过内容检查，已停止投递。','agent_id':aid})
        return False
    text=raw[:1200]
    if kind!='reply':
        candidate=compact(text)
        previous=[compact(turn['content']) for turn in state.turns if turn['role']=='assistant'][-10:]
        if any(candidate==item or (len(candidate)>20 and SequenceMatcher(None,candidate,item).ratio()>.9) for item in previous):
            state.metrics['idle_skipped']+=1
            return False
    state.turns.extend([{'role':'user','content':json.dumps({'event':'idle','kind':kind} if kind!='reply' else {'viewer':viewer,'danmaku':message},ensure_ascii=False)}, {'role':'assistant','content':text,'performance':result.get('performance')}])
    if result.get('show_notes'):
        from .hosting import ShowNotes
        try:state.show_notes=ShowNotes.model_validate(result['show_notes']).model_dump()
        except (ValueError,TypeError):pass
    if kind=='reply' and message:
        from astraverse.modules.agents.profiles import get_profile
        from .memory import remember
        source_id=archive.record(state.archive_id,'viewer',message)
        remember(get_profile(aid),message,state.archive_id,source_id)
    if kind in ('memory','dream'):state.fiction.append(text)
    if not result.get('archive_skip'):
        source_id=archive.record(state.archive_id,result.get('archive_kind',kind),text)
        consistency=result.get('character_consistency') or {}
        if consistency.get('accepted') and kind not in ('memory','dream'):
            from astraverse.modules.agents.profiles import get_profile
            from astraverse.modules.conversation.stance import record as remember_stance
            remember_stance(get_profile(aid),text,str(state.archive_id)+':'+str(source_id) if source_id else None,consistency.get('voice_revision'),public=True)
    state.last_published=time.monotonic()
    state.metrics['replies']+=1
    if kind!='reply':state.metrics['proactive']+=1
    row=channel(cid)
    await emit(cid,{'kind':'reply','user':viewer,'text':text,'agent_id':aid,'performance':result.get('performance'),'voice':row['voice'],'mode':result.get('mode'),'proactive':kind!='reply','narrative':kind,'performance_source':result.get('performance_source'),'team':result.get('team'),'sources':result.get('sources',[]),'character_consistency':result.get('character_consistency')})
    if current() and result.get('resource_action'):
        from astraverse.modules.resources.library import live_catalog
        action=result['resource_action']
        if any(r.id==action.get('resource_id') and r.kind==action.get('kind') for r in live_catalog(aid)):
            await emit(cid,{'kind':'resource','agent_id':aid,'resource_action':action})
    if not row['send_to_platform'] or not current():return True
    if row['transport']!='bridge' and state.status!='connected':
        await emit(cid,{'kind':'delivery','text':'平台未连接，本条回复仅在本地展示。'});return True
    if row['transport']=='youtube':
        async with state.send_lock:
            if not current() or state.status!='connected' or not state.adapter:return True
            try:
                await state.adapter.send(text)
                await emit(cid,{'kind':'delivery','text':'YouTube已返回消息ID，回复已提交。'})
            except Exception as exc:
                state.metrics['failed']+=1
                if isinstance(exc,PlatformError) and exc.fatal:
                    state.status='error';state.error=str(exc)
                    if state.connection:state.connection.cancel()
                await emit(cid,{'kind':'delivery','text':'YouTube发送失败或结果未知，本条不自动重发。'})
    elif row['transport']=='twitch' and state.writer:
        global last_twitch_send
        async with twitch_send_lock:
            await asyncio.sleep(max(0,2.1-(time.monotonic()-last_twitch_send)))
            if not current():return True
            part=('[AI] '+re.sub(r'[\x00-\x1f]+',' ',text)).encode()[:440].decode('utf-8',errors='ignore')
            state.writer.write(f'PRIVMSG #{row["room"].lower()} :{part}\r\n'.encode());await state.writer.drain()
            last_twitch_send=time.monotonic()
        await emit(cid,{'kind':'delivery','text':'回复已提交Twitch；不代表平台送达确认。'})
    elif row['transport']=='bridge':
        sequence=max(int(time.time()*1000),(state.outbox[-1]['sequence']+1) if state.outbox else 0)
        state.outbox.append({'sequence':sequence,'id':uuid.uuid4().hex,'agent_id':aid,'reply_to':reply_to,'text':text,'created':time.time(),'proactive':kind!='reply'})
    return True


async def maybe_idle(cid):
    state=rt(cid)
    now=time.monotonic()
    if state.solo and state.status=='connected' and now>=state.solo['deadline']:
        await end_solo(cid,'ended','本地直播测试已到设定时长，已停止。');return
    if state.poll and state.poll['open']:return
    if not idle_handler or state.status not in ('waiting','connected') or not state.queue.empty() or state.idle_generation or playback_active(state):return
    row=channel(cid);aid=row['agent_id']
    if not aid:return
    from astraverse.modules.resources.reading import status as reading_status
    reading=reading_status(aid,public=True)
    if reading and reading['active']:return
    # A configuration error must not create an unbounded one-second retry loop.
    if now-state.last_idle_attempt<(state.solo.get('next_interval',state.solo['interval']) if state.solo else 20):return
    if state.solo:
        if now>=state.solo['deadline']:
            await end_solo(cid,'ended','本地直播测试已到设定时长，已停止。');return
        if state.solo['attempts']>=state.solo['limit']:
            await end_solo(cid,'budget','本地直播测试已达生成次数上限，已停止。');return
    try:program=session_program(profile_program(aid),state.solo)
    except Exception:
        state.last_idle_attempt=now
        raise
    daily=await daily_status(cid,program) if program.daily.enabled else None
    if not daily:state.daily_state=None
    state.idle_enabled=program.idle_enabled or bool(daily);state.idle_limit=program.idle_max_turns
    if program.segment=='closing':return
    if daily:
        if daily['paused']:return
    elif not program.idle_enabled or (not state.solo and state.idle_count>=program.idle_max_turns):return
    interval=program.daily.interval if daily else program.idle_interval
    if daily:
        interval = max(20, int(interval * {'high': .5, 'balanced': 1, 'low': 2}[daily.get('interaction','balanced')]))
    if now-max(state.last_viewer,state.last_idle_attempt,state.last_reply)<max(interval,row['cooldown']):return
    revision=state.revision;activity=state.activity_revision
    # Private inner life informs personality; it is not an automatic public segment.
    kind='knowledge'
    state.last_idle_attempt=now;state.idle_count+=1;state.idle_index+=1
    if daily:state.daily_attempts+=1
    if state.solo:state.solo['attempts']+=1
    async def generate():
        started=time.monotonic()
        async with inference_limit:
            if activity!=state.activity_revision or not state.queue.empty():return
            with live_timing(state):
                result=await idle_handler(aid,row['name'],list(state.turns),kind,list(state.fiction))
        # Check settings again: disabling auto-hosting while a model runs takes effect here.
        latest=session_program(profile_program(aid),state.solo)
        if (not (latest.idle_enabled or latest.daily.enabled) or latest.segment=='closing' or latest.model_dump()!=program.model_dump()
                or revision!=state.revision or activity!=state.activity_revision or not state.queue.empty()):return
        if daily:
            current_daily=await daily_status(cid,latest)
            if current_daily['reason'] in ('rest','ended') or current_daily['key']!=daily['key']:return
        if result.get('mode')!='llm':
            state.metrics['idle_skipped']+=1
            if state.solo:
                await end_solo(cid,'model-unavailable','直播已停止：文本模型不可用，请检查模型设置。');return
            state.idle_count=program.idle_max_turns
            if daily:state.daily_attempts=program.daily.max_attempts
            await emit(cid,{'kind':'notice','text':'主动主持已等待：请先配置可用的角色文本模型。'})
            return
        if state.solo:state.solo['failures']=0
        state.metrics['latency_ms']=round((time.monotonic()-started)*1000)
        state.last_reply=time.monotonic()
        published=await publish(cid,aid,result,'角色主动话题',revision=revision,activity=activity,kind=kind)
        if published and state.solo:
            delay=result.get('next_wait_seconds')
            state.solo['next_interval']=delay if type(delay) is int and 5<=delay<=600 else state.solo['interval']
    task=asyncio.create_task(generate());state.idle_generation=task
    try:await task
    except asyncio.CancelledError:
        if asyncio.current_task().cancelling():raise
    finally:
        if state.idle_generation is task:state.idle_generation=None
        # Cooldown starts after completion, including model failures or dropped output.
        state.last_idle_attempt=time.monotonic()


async def daily_status(cid, program):
    state=rt(cid)
    now=time.monotonic()
    if state.daily_started is None:state.daily_started=now
    current=phase(program.daily)
    remaining=max(0,int(86400-(now-state.daily_started)))
    reason='ended' if remaining==0 else 'rest' if current['activity']=='rest' else 'budget' if state.daily_attempts>=program.daily.max_attempts else ''
    data={**current,'attempts':state.daily_attempts,'limit':program.daily.max_attempts,'remaining_seconds':remaining,'paused':bool(reason),'reason':reason}
    state.daily_state=data
    key=(current['key'],reason)
    if key!=state.daily_key:
        state.daily_key=key
        await emit(cid,{'kind':'routine','text':f"虚拟作息 · {current['title']}"+(' · 已暂停生成' if reason else ''),'routine':data})
    return data


def profile_team(agent_id):
    from astraverse.modules.agents.profiles import get_profile
    return get_profile(agent_id).team


def moderate_event(state,event,team):
    now=time.monotonic()
    if prohibited(event.text):return '内容检查未通过'
    normalized=compact(event.text)
    for user,text,at in reversed(state.moderation_seen):
        if now-at>max(team.repeat_window,team.viewer_cooldown):continue
        if text==normalized and now-at<team.repeat_window:return '重复刷屏'
        if user==event.user and now-at<team.viewer_cooldown:return '发言过于频繁'
    state.moderation_seen.append((event.user,normalized,now))
    return ''


def public_poll(poll):
    if not poll:return None
    counts=[sum(v==i for v in poll['votes'].values()) for i in range(len(poll['options']))]
    return {k:poll[k] for k in ('question','options','ends_at','open')} | {'counts':counts,'voters':len(poll['votes'])}

class PollRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    question:str=Field(min_length=1,max_length=120)
    options:list[str]=Field(min_length=2,max_length=4)
    duration:int=Field(default=60,ge=15,le=600)
    @field_validator('options')
    @classmethod
    def options_valid(cls,items):
        items=[v.strip() for v in items]
        if any(not v or len(v)>60 for v in items) or len(set(items))!=len(items):raise ValueError('选项须不同且每项1–60字')
        return items

@router.post('/channels/{cid}/poll')
async def create_poll(cid:str,body:PollRequest):
    row=channel(cid);state=rt(cid)
    if state.status not in ('waiting','connected') or not row['agent_id']:raise HTTPException(409,'请先绑定角色并启动互动')
    if state.poll and state.poll['open']:raise HTTPException(409,'已有投票进行中')
    if not body.question.strip() or blocked_output(body.question+' '.join(body.options),profile_program(row['agent_id'])):raise HTTPException(422,'投票内容未通过检查')
    state.activity_revision+=1
    if state.idle_generation:state.idle_generation.cancel()
    announcement='本轮投票：'+body.question+'；'+'；'.join(f'{i+1}：{v}' for i,v in enumerate(body.options))+f'。请发送选项数字，{body.duration}秒后截止；同昵称最后一次选择有效。'
    if blocked_output(announcement,profile_program(row['agent_id'])):raise HTTPException(422,'投票播报未通过检查')
    state.poll={'question':body.question.strip(),'options':body.options,'ends_at':time.time()+body.duration,'deadline':time.monotonic()+body.duration,'open':True,'votes':{}}
    text=announcement
    await publish(cid,row['agent_id'],{'reply':text,'mode':'program','archive_kind':'poll_start'},'节目调度',revision=state.revision,message='程序发起投票')
    return public_poll(state.poll)

async def finish_poll(cid,force=False):
    state=rt(cid);poll=state.poll
    if not poll or not poll['open'] or (not force and time.monotonic()<poll['deadline']):return
    poll['open']=False
    result=public_poll(poll);counts=result['counts'];highest=max(counts)
    winners=[poll['options'][i] for i,n in enumerate(counts) if n==highest] if highest else []
    text='投票结束：'+poll['question']+'。'+('没有有效投票，本轮不产生胜出选项。' if not winners else '、'.join(winners)+f'获得最多票（{highest}票）'+('，本轮并列。' if len(winners)>1 else '。'))
    archive.record(state.archive_id,'poll',text)
    row=channel(cid)
    if row['agent_id']:await publish(cid,row['agent_id'],{'reply':text,'mode':'program','archive_skip':True},'节目调度',revision=state.revision,message='程序统计的实际投票结果')
    await emit(cid,{'kind':'poll','text':'投票已结算，可查看选项票数。'})

@router.post('/channels/{cid}/poll/finish')
async def close_poll(cid:str):
    channel(cid);await finish_poll(cid,True);return public_poll(rt(cid).poll)

@router.get('/agents/{agent_id}/sessions')
async def session_list(agent_id:str):
    from astraverse.modules.agents.profiles import get_profile
    get_profile(agent_id)
    return {'sessions':archive.sessions(agent_id)}

@router.delete('/agents/{agent_id}/sessions')
async def clear_sessions(agent_id:str):
    from astraverse.modules.agents.profiles import get_profile
    get_profile(agent_id)
    from .memory import clear
    clear(agent_id);archive.clear(agent_id)
    for cid,state in runtime.items():
        try: owned=channel(cid)['agent_id']==agent_id
        except HTTPException: continue
        if not owned: continue
        state.revision+=1;state.turns.clear();state.fiction.clear();state.show_notes=None
        state.archive_id=archive.begin(agent_id,cid) if state.status in ('connected','waiting') else None
        while not state.queue.empty():
            try: state.queue.get_nowait();state.queue.task_done()
            except asyncio.QueueEmpty: break
    return {'cleared':True}


@router.get('/agents/{agent_id}/sessions/{sid}')
async def session_detail(agent_id:str,sid:str):
    result=archive.detail(agent_id,sid)
    if result is None:raise HTTPException(404,'场次不存在')
    return {'events':result}


@router.get('/agents/{agent_id}/memory')
async def memory_list(agent_id:str):
    from astraverse.modules.agents.profiles import get_profile
    from .memory import entries
    profile=get_profile(agent_id)
    from astraverse.modules.conversation.stance import entries as preferences
    return {'memories':entries(agent_id),'context_turns':profile.live_program.context_turns,'enabled':profile.live_program.memory_enabled,'character_preferences':preferences(profile,public=True)}

@router.delete('/agents/{agent_id}/memory')
async def memory_clear(agent_id:str):
    return await clear_sessions(agent_id)
