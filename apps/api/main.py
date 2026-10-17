"""AstraVerse local MVP. Browser renders; API validates and broadcasts commands."""
from __future__ import annotations

import asyncio
import logging
import json
import os
from typing import Any, Literal
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from model_router import router as models_router, conversation, load_settings
from resource_agent import ResourceSummary, PendingChoice, decide, resource_context
from pydantic import BaseModel, ConfigDict, Field, ValidationError

load_dotenv(Path(__file__).with_name('.env'))
logger = logging.getLogger('astraverse')
app = FastAPI(title='AstraVerse API', version='0.1.0')
clients: set[WebSocket] = set()
state: dict[str, Any] = {'character': 0, 'world': 'lunar', 'action': 'idle', 'position': [0, 0, 0], 'playing': False, 'volume': 65}
lock = asyncio.Lock()
app.include_router(models_router)
state.update({'expression':'neutral','expressionIntensity':0.7,'pose':{'headYaw':0,'headPitch':0,'leftArm':0,'rightArm':0,'leftElbow':0,'rightElbow':0,'leftLeg':0,'rightLeg':0,'bodyLean':0},'naturalMotion':True,'gazeTracking':True,'breath':0.6,'speaking':False,'rotation':0})
ALLOWED_ORIGINS = {'http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174','http://127.0.0.1:8000'}

@app.middleware('http')
async def local_origin_boundary(request: Request, call_next):
    origin=request.headers.get('origin')
    if request.method in ('POST','PUT','PATCH','DELETE') and origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({'detail':'Untrusted browser origin'},status_code=403)
    response=await call_next(request)
    if request.url.path.startswith('/api/models'):
        response.headers['Cache-Control']='no-store'
    return response

@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422,content={'detail':[{'loc':list(e['loc']),'msg':e['msg'],'type':e['type']} for e in exc.errors()]})

class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    tool: str = Field(max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    character: str = Field(default='星澜', max_length=40)
    resources: list[ResourceSummary] = Field(default_factory=list,max_length=200)
    pending: PendingChoice | None = None
    selection_id: str | None = Field(default=None,max_length=120)

class MoveArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    x: float = Field(default=0, ge=-3, le=3, allow_inf_nan=False)
    z: float = Field(default=0, ge=-3, le=3, allow_inf_nan=False)

class AnimationArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    animation: Literal['idle', 'wave', 'dance', 'jump'] = 'idle'

class SceneArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scene: Literal['lunar', 'aurora', 'sunset'] = 'lunar'

class SpeakArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(min_length=1, max_length=1000)

class EmoteArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    emotion: Literal['happy', 'neutral', 'curious', 'sad', 'surprised', 'relaxed'] = 'happy'
    intensity: float = Field(default=0.7,ge=0,le=1,allow_inf_nan=False)

class PoseArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    headYaw: float = Field(default=0,ge=-60,le=60,allow_inf_nan=False)
    headPitch: float = Field(default=0,ge=-35,le=35,allow_inf_nan=False)
    leftArm: float = Field(default=0,ge=-120,le=120,allow_inf_nan=False)
    rightArm: float = Field(default=0,ge=-120,le=120,allow_inf_nan=False)
    leftElbow: float = Field(default=0,ge=0,le=140,allow_inf_nan=False)
    rightElbow: float = Field(default=0,ge=0,le=140,allow_inf_nan=False)
    leftLeg: float = Field(default=0,ge=-40,le=40,allow_inf_nan=False)
    rightLeg: float = Field(default=0,ge=-40,le=40,allow_inf_nan=False)
    bodyLean: float = Field(default=0,ge=-20,le=20,allow_inf_nan=False)

class PresenceArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    naturalMotion: bool = True
    gazeTracking: bool = True
    breath: float = Field(default=0.6,ge=0,le=1,allow_inf_nan=False)

class RotateArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    degrees: float = Field(default=0,ge=-180,le=180,allow_inf_nan=False)

TOOLS = {
    'character.move': MoveArgs, 'character.animate': AnimationArgs,
    'character.jump': None, 'character.dance': None, 'character.emote': EmoteArgs,
    'character.speak': SpeakArgs, 'character.pose':PoseArgs, 'character.presence':PresenceArgs, 'character.rotate':RotateArgs, 'scene.load': SceneArgs, 'scene.inspect': None,
    'music.play': None, 'music.pause': None, 'system.get_state': None,
}
# Unsupported features remain discoverable as capability metadata, never fake success.
PLANNED = ['character.sing', 'scene.navigate', 'camera.control']

async def broadcast(event: dict[str, Any]) -> None:
    for ws in list(clients):
        try:
            await ws.send_json(event)
        except (RuntimeError, WebSocketDisconnect, OSError):
            clients.discard(ws)

async def execute(command: Command) -> dict[str, Any]:
    if command.tool in PLANNED:
        raise HTTPException(501, detail='Capability is planned, not implemented in this MVP')
    if command.tool not in TOOLS:
        raise HTTPException(404, detail='Unknown tool')
    schema = TOOLS[command.tool]
    try:
        args = schema.model_validate(command.arguments).model_dump() if schema else {}
        if not schema and command.arguments:
            raise ValueError('This tool does not accept arguments')
    except (ValidationError, ValueError) as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    async with lock:
        tool = command.tool
        if tool == 'character.move': state['position'] = [args['x'], 0, args['z']]
        elif tool == 'character.animate': state['action'] = args['animation']
        elif tool == 'character.jump': state['action'] = 'jump'
        elif tool == 'character.dance': state['action'] = 'dance'
        elif tool == 'scene.load': state['world'] = args['scene']
        elif tool == 'music.play': state['playing'] = True
        elif tool == 'music.pause': state['playing'] = False
        elif tool == 'character.speak': await broadcast({'type': 'speak', 'text': args['text']})
        elif tool == 'character.emote':
            state.update({'expression':args['emotion'],'expressionIntensity':args['intensity']})
        elif tool == 'character.pose':
            state['pose']={**state.get('pose',{}),**{key:args[key] for key in command.arguments}}
            state['action']='idle'
        elif tool == 'character.presence': state.update(args)
        elif tool == 'character.rotate': state['rotation']=args['degrees']
        if tool not in ('system.get_state', 'scene.inspect'):
            await broadcast({'type': 'state', 'data': state.copy(), 'fields': {'character.move':['position'],'character.animate':['action'],'character.jump':['action'],'character.dance':['action'],'scene.load':['world'],'music.play':['playing'],'music.pause':['playing'],'character.emote':['expression','expressionIntensity'],'character.pose':['pose','action'],'character.presence':['naturalMotion','gazeTracking','breath'],'character.rotate':['rotation']}.get(tool,[])})
        return {'status': 'dispatched' if clients else 'stored', 'clients': len(clients), 'state': state.copy(), 'render_acknowledged': False}

@app.get('/api/health')
async def health() -> dict[str, Any]:
    config=load_settings()
    route=config.routes.get('text')
    target=next(((p,t.model) for t in ([route.primary,*route.fallbacks] if route else []) for p in config.providers if p.id==t.provider and p.enabled),None)
    return {'status':'ok','mode':'llm' if target else 'unavailable' if route else 'local-rules','provider':target[0].name if target else None,'model':target[1] if target else None}

@app.get('/api/state')
async def get_state() -> dict[str, Any]:
    return state.copy()

@app.get('/api/tools')
async def tools() -> dict[str, Any]:
    return {'tools': [{'name': name, 'inputSchema': schema.model_json_schema() if schema else {'type':'object','properties':{},'additionalProperties':False}} for name, schema in TOOLS.items()], 'planned': PLANNED}

@app.post('/api/tools/execute')
async def run_tool(command: Command) -> dict[str, Any]:
    return await execute(command)

@app.post('/api/chat')
async def chat(request: ChatRequest) -> dict[str, Any]:
    message = request.message.strip()
    if not message:
        raise HTTPException(422, detail='Message must not be blank')
    resource_decision=decide(message,request.resources,request.pending,request.selection_id)
    if resource_decision is not None:
        return resource_decision
    action = 'dance' if any(word in message for word in ('跳舞', '支舞', 'dance')) else 'wave' if any(word in message for word in ('你好', '挥手', '挥挥手')) else None
    expression = next((emotion for words, emotion in [(('开心','微笑','笑一个'),'happy'),(('难过','伤心'),'sad'),(('惊讶','吃惊'),'surprised'),(('好奇',),'curious'),(('放松',),'relaxed')] if any(word in message for word in words)), None)
    config=load_settings()
    used_provider=None
    used_model=None
    if 'text' in config.routes:
        result=await conversation(message,system=f'你是原创虚拟伙伴{request.character}，温柔而好奇。使用简短中文回复。'+resource_context(request.resources))
        reply=result['text']
        used_provider=result['provider']
        used_model=result['model']
        mode='llm'
    else:
        mode='local-rules'
        reply = ('当然。让星光做我们的舞台，一起跟着节奏摇摆吧 ✧' if action == 'dance' else '你好呀！很高兴在这片星光下遇见你。' if action else '我在这里陪着你。可以试着对我说「笑一个」「挥挥手」或「跳一支舞」。') + '\n（本地规则助手，尚未接入大语言模型）'
    pose = {'leftArm':80} if '抬起左手' in message else {'rightArm':80} if '抬起右手' in message else {'leftArm':85,'rightArm':85} if '伸展双臂' in message else {'headPitch':20} if '低头' in message else None
    if pose:
        await execute(Command(tool='character.pose',arguments=pose))
    if expression:
        await execute(Command(tool='character.emote',arguments={'emotion':expression}))
    if action:
        await execute(Command(tool='character.animate', arguments={'animation':action}))
    return {'reply':reply, 'action':action, 'mode':mode, 'expression':expression, 'provider':used_provider, 'model':used_model}

@app.websocket('/api/ws')
async def websocket(ws: WebSocket) -> None:
    # No remote browser origins in the local single-workspace MVP.
    origin = ws.headers.get('origin', '')
    if origin and origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    clients.add(ws)
    try:
        await ws.send_json({'type':'state','data':state.copy()})
        while True:
            try:
                payload = await ws.receive_text()
                if len(payload) > 65536:
                    raise ValueError('Command payload exceeds 64 KiB')
                raw = json.loads(payload)
                if not isinstance(raw, dict):
                    raise ValueError('Command must be a JSON object')
                if raw.get('type') != 'command':
                    raise ValueError('Unknown event type')
                result = await execute(Command.model_validate({'tool':raw.get('tool'), 'arguments':raw.get('arguments',{})}))
                await ws.send_json({'type':'result','data':result})
            except (ValidationError, HTTPException, ValueError) as exc:
                await ws.send_json({'type':'error','detail':str(exc)})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        clients.discard(ws)
