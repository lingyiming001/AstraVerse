"""Local model registry, write-only credentials and capability-based routing."""
from __future__ import annotations
import asyncio
import base64
import json
import os
import re
import tempfile
from contextvars import ContextVar
from pathlib import Path
from astraverse.core.paths import DATA_DIR
from astraverse.modules.conversation.policy import POLICY_PROMPT, validate_input, safe_model_output, safe_reply
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, Response, Depends
from astraverse.modules.models.schemas import Capability, CAPABILITIES, StrictModel, Model, Provider, Target, Route, Settings, Attachment, InferenceRequest, Probe, ModelTestRequest

CONFIG_PATH = Path(os.getenv('ASTRAVERSE_CONFIG', str(DATA_DIR / 'models.json')))
router = APIRouter(prefix='/api/models', tags=['Model routing'])
write_lock = asyncio.Lock()
config_scope: ContextVar[Path | None] = ContextVar("model_config_scope",default=None)

def agent_config_path(agent_id: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,120}",agent_id):raise HTTPException(422,"Invalid character ID")
    return CONFIG_PATH.parent / "agent-models" / (agent_id+".json")








def load_settings(path: Path | None = None) -> Settings:
    path = path or config_scope.get() or CONFIG_PATH
    if path.exists():
        try:
            return Settings.model_validate_json(path.read_text())
        except (ValueError, OSError) as exc:
            raise HTTPException(500, 'Model configuration is unreadable; restore the local config file') from exc
    if path != CONFIG_PATH:return Settings()
    if os.getenv('LLM_MODEL'):
        return Settings(providers=[Provider(id='environment', name='环境变量供应商', base_url=os.getenv('LLM_BASE_URL','https://api.openai.com/v1'), api_key=os.getenv('LLM_API_KEY'), models=[Model(id=os.environ['LLM_MODEL'],capabilities=['text'])])], routes={'text':Route(primary=Target(provider='environment',model=os.environ['LLM_MODEL']))})
    return Settings()


def public_settings(config: Settings) -> dict[str, Any]:
    data = config.model_dump(exclude={'providers': {'__all__': {'api_key'}}})
    for entry, provider in zip(data['providers'],config.providers):
        entry['key_configured'] = bool(provider.api_key)
    return data

@router.get('/settings')
async def get_settings() -> dict[str, Any]:
    return public_settings(load_settings())

@router.put('/settings')
async def save_settings(config: Settings) -> dict[str, Any]:
    async with write_lock:
        path=config_scope.get() or CONFIG_PATH
        previous = {p.id:p for p in load_settings().providers}
        for provider in config.providers:
            if provider.clear_key:
                provider.api_key = None
            elif provider.api_key is None and provider.id in previous:
                provider.api_key = previous[provider.id].api_key
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix='.models-')
        try:
            with os.fdopen(descriptor, 'w') as handle:
                os.chmod(temporary,0o600)
                handle.write(config.model_dump_json(indent=2))
            os.replace(temporary,path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    return public_settings(config)


def get_targets(capability: Capability, config: Settings | None = None) -> tuple[Settings, list[tuple[Provider, str]]]:
    config = config or load_settings()
    route = config.routes.get(capability)
    if not route:
        raise HTTPException(409, f'请先在模型路由中配置 {capability} 能力')
    providers = {p.id:p for p in config.providers}
    targets = [(providers[t.provider],t.model) for t in [route.primary,*route.fallbacks] if providers[t.provider].enabled]
    if not targets:
        raise HTTPException(409,'该路由的供应商均已停用')
    return config, targets


def resolve_target(capability: Capability, target: Target, config: Settings | None = None) -> tuple[Settings, list[tuple[Provider,str]]]:
    config=config or load_settings()
    provider=next((p for p in config.providers if p.id==target.provider and p.enabled),None)
    model=next((m for m in provider.models if m.id==target.model and capability in m.capabilities),None) if provider else None
    if not provider or not model:
        raise HTTPException(409,'此角色的专属模型不可用，请在角色Agent设置中重新选择，或改为跟随全局路由。')
    return config,[(provider,model.id)]


def client_for(timeout: int) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, follow_redirects=False)


def headers(provider: Provider) -> dict[str,str]:
    return {'Authorization': f'Bearer {provider.api_key}'} if provider.api_key else {}

async def request_json(provider: Provider, path: str, payload: dict[str,Any], timeout: int, method: str = 'POST') -> dict[str,Any]:
    async with client_for(timeout) as client:
        response = await client.request(method, provider.base_url+path, headers=headers(provider), json=payload if method=='POST' else None)
        response.raise_for_status()
        value = response.json()
        if not isinstance(value,dict): raise ValueError('Expected JSON object')
        return value



async def conversation(prompt: str, capability: Capability = 'text', attachments: list[Attachment] | None = None, system: str = '', history: list[dict[str,str]] | None = None, target_override: Target | None = None, settings_override: Settings | None = None) -> dict[str,Any]:
    prompt = validate_input(prompt, 12000)
    history = [turn for turn in (history or []) if safe_reply(turn.get('content', '')) == turn.get('content', '')]
    config, targets = resolve_target(capability,target_override,settings_override) if target_override else get_targets(capability,settings_override)
    content: Any = prompt
    if capability in ('vision','video'):
        images = attachments or []
        if not images or any(not a.mime.startswith('image/') for a in images):
            raise HTTPException(422, '图片/视频理解需要图片或视频关键帧')
        content = [{'type':'text','text':prompt}, *[{'type':'image_url','image_url':{'url':f'data:{a.mime};base64,{a.data}'}} for a in images]]
    attempts: list[dict[str,Any]] = []
    for provider, model in targets:
        try:
            result = await request_json(provider,'/chat/completions',{'model':model,'messages':[{'role':'system','content':(system or '请用中文准确回答。视频输入为按时间顺序采样的关键帧，仅描述可见内容，不推断原始声音。') + POLICY_PROMPT}, *(history or []), {'role':'user','content':content}],'max_tokens':config.max_tokens},config.timeout)
            text = result['choices'][0]['message']['content']
            if not isinstance(text,str) or not text.strip(): raise ValueError('Missing text response')
            return {'kind':'text','text':safe_model_output(text),'provider':provider.name,'model':model,'attempts':attempts}
        except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError) as exc:
            attempts.append({'provider':provider.name,'status':exc.response.status_code if isinstance(exc,httpx.HTTPStatusError) else 'unavailable'})
    raise HTTPException(502, {'message':'所有路由均失败，请检查密钥、模型能力与地址','attempts':attempts})

@router.post('/infer')
async def infer(request: InferenceRequest) -> Any:
    validate_input(request.prompt, 12000)
    settings=None
    if request.agent_id:
        from astraverse.modules.agents.profiles import get_profile, model_settings
        settings=model_settings(get_profile(request.agent_id),request.capability)
    if request.capability in ('text','vision','video'):
        return await conversation(request.prompt,request.capability,request.attachments,settings_override=settings)
    config, targets = get_targets(request.capability,settings)
    # Generation never silently retries/fails over: requests may have already incurred a charge.
    provider, model = targets[0]
    try:
        if request.capability == 'image':
            result = await request_json(provider,'/images/generations',{'model':model,'prompt':request.prompt,'n':1,'size':'1024x1024'},config.timeout)
            image = result['data'][0]
            source = f"data:image/png;base64,{image['b64_json']}" if image.get('b64_json') else image['url']
            if not source.startswith(('https://','data:image/')): raise ValueError('Unsafe image URL')
            return {'kind':'image','url':source,'provider':provider.name,'model':model}
        if request.capability == 'speech':
            selected = next(entry for entry in provider.models if entry.id == model)
            if selected.speech_backend == 'dashscope':
                from astraverse.modules.models.adapters.qwen_tts import synthesize
                async with client_for(config.timeout) as client:
                    audio = await synthesize(client, base_url=provider.base_url, api_key=provider.api_key, model=model, text=request.prompt, voice=request.voice, default_voice=selected.speech_voice, language=selected.speech_language)
                return Response(content=audio, media_type='audio/wav', headers={'X-Astra-Model': model})
            async with client_for(config.timeout) as client:
                response = await client.post(provider.base_url+'/audio/speech',headers=headers(provider),json={'model':model,'input':request.prompt,'voice':request.voice or 'nova','response_format':'mp3'})
                response.raise_for_status()
                if not response.content or response.headers.get('content-type','').startswith('application/json'): raise ValueError('Expected audio bytes')
                return Response(content=response.content,media_type='audio/mpeg',headers={'X-Astra-Model':model})
        if request.capability == 'transcription':
            if len(request.attachments)!=1 or not request.attachments[0].mime.startswith('audio/'):
                raise HTTPException(422,'音频转写需要一个 WAV/MP3 文件')
            audio = request.attachments[0]
            raw = base64.b64decode(audio.data)
            async with client_for(config.timeout) as client:
                response = await client.post(provider.base_url+'/audio/transcriptions',headers=headers(provider),data={'model':model},files={'file':('audio.wav' if audio.mime=='audio/wav' else 'audio.mp3',raw,audio.mime)})
                response.raise_for_status()
                text = response.json()['text']
                if not isinstance(text,str): raise ValueError('Expected transcription text')
                return {'kind':'text','text':safe_reply(text),'provider':provider.name,'model':model}
        if request.capability == 'video_generate':
            async with client_for(config.timeout) as client:
                response = await client.post(provider.base_url+'/videos',headers=headers(provider),files={key:(None,value) for key,value in {'model':model,'prompt':request.prompt,'seconds':'4','size':'1280x720'}.items()})
                response.raise_for_status()
                result=response.json()
            job_id = result['id']
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,200}',job_id): raise ValueError('Invalid video job ID')
            return {'kind':'video_job','id':job_id,'status':result.get('status','queued'),'provider_id':provider.id,'model':model}
    except HTTPException: raise
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError) as exc:
        status = exc.response.status_code if isinstance(exc,httpx.HTTPStatusError) else None
        raise HTTPException(502, {'message':'供应商请求失败；生成请求不会自动重试，以免重复计费','provider':provider.name,'upstream_status':status}) from exc


@router.post('/probe')
async def probe(request: Probe) -> dict[str,Any]:
    config=load_settings()
    provider=next((p for p in config.providers if p.id==request.provider_id),None)
    if not provider: raise HTTPException(404,'供应商不存在，请先保存配置')
    try:
        result=await request_json(provider,'/models',{},min(config.timeout,15),'GET')
        return {'status':'connected','models':[m['id'] for m in result.get('data',[]) if isinstance(m,dict) and isinstance(m.get('id'),str)][:100]}
    except (httpx.HTTPError,ValueError,TypeError) as exc:
        raise HTTPException(502,'连接测试失败，请检查地址、凭据和 /models 支持；密钥不会在错误中返回') from exc

@router.get('/video/{provider_id}/{job_id}')
async def video_status(provider_id: str, job_id: str) -> dict[str,Any]:
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,200}',job_id): raise HTTPException(422,'Invalid job ID')
    config=load_settings()
    provider=next((p for p in config.providers if p.id==provider_id and p.enabled),None)
    if not provider: raise HTTPException(404,'Provider unavailable')
    try:
        result=await request_json(provider,f'/videos/{job_id}',{},config.timeout,'GET')
        return {'id':job_id,'status':result.get('status','unknown'),'progress':result.get('progress'), 'error': '视频任务失败，请查看供应商控制台' if result.get('error') else None}
    except (httpx.HTTPError,ValueError) as exc: raise HTTPException(502,'视频任务状态查询失败') from exc

@router.get('/video/{provider_id}/{job_id}/content')
async def video_content(provider_id: str, job_id: str) -> Response:
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,200}',job_id): raise HTTPException(422,'Invalid job ID')
    config=load_settings()
    provider=next((p for p in config.providers if p.id==provider_id and p.enabled),None)
    if not provider: raise HTTPException(404,'Provider unavailable')
    try:
        async with client_for(config.timeout) as client:
            async with client.stream('GET',provider.base_url+f'/videos/{job_id}/content',headers=headers(provider)) as response:
                response.raise_for_status()
                data=bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data)>50*1024*1024: raise HTTPException(413,'视频超过 50 MB 预览上限')
                return Response(bytes(data),media_type='video/mp4')
    except httpx.HTTPError as exc: raise HTTPException(502,'视频内容获取失败') from exc


@router.post('/test')
async def test_model(request: ModelTestRequest) -> dict[str,Any]:
    """One small real completion, exact saved target, no fallback or automatic retry."""
    from datetime import datetime, timezone
    from time import perf_counter
    config=load_settings()
    provider=next((p for p in config.providers if p.id==request.provider_id),None)
    if not provider: raise HTTPException(404,'供应商不存在，请先保存配置')
    if not provider.enabled: raise HTTPException(409,'供应商已停用，请先启用并保存')
    model=next((m for m in provider.models if m.id==request.model_id),None)
    if not model: raise HTTPException(404,'模型尚未保存，请先保存配置')
    if 'text' not in model.capabilities:
        raise HTTPException(409,'该模型未声明文本能力，请在多模态实验室用对应输入验证，不能用聊天测试代替')
    started=perf_counter()
    result:dict[str,Any]={'provider_id':provider.id,'model_id':model.id,'scope':'chat-completion','checked_at':datetime.now(timezone.utc).isoformat()}
    try:
        response=await request_json(provider,'/chat/completions',{'model':model.id,'messages':[{'role':'user','content':'请只回复：连接成功'}],'max_tokens':32,'stream':False},min(config.timeout,30))
        reply=response['choices'][0]['message']['content']
        if not isinstance(reply,str) or not reply.strip(): raise ValueError('No assistant text returned')
        # Even successful upstream text is redacted against the configured credential.
        preview=reply.strip()
        if provider.api_key: preview=preview.replace(provider.api_key,'[redacted]')
        result.update({'status':'success','message':'模型实际调用成功','reply':preview[:200]})
        usage=response.get('usage')
        if isinstance(usage,dict): result['total_tokens']=usage.get('total_tokens') if isinstance(usage.get('total_tokens'),int) else None
    except httpx.HTTPStatusError as exc:
        status=exc.response.status_code
        messages={400:'请求参数或模型接口不兼容，请核对模型 ID 与聊天接口',401:'API Key 无效或已失效，请重新填写',403:'当前密钥没有该模型的调用权限',404:'模型或聊天接口不存在，请检查模型 ID 和 Base URL',429:'供应商限流或额度不足，请查看供应商控制台'}
        result.update({'status':'failed','http_status':status,'message':messages.get(status,'供应商服务暂时不可用，请稍后手动重试')})
    except httpx.TimeoutException:
        result.update({'status':'failed','message':'模型响应超时，请检查网络、供应商状态或本地模型是否已加载'})
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError):
        result.update({'status':'failed','message':'未收到有效的聊天回复，请确认 Base URL、网络和模型接口兼容性'})
    result['latency_ms']=round((perf_counter()-started)*1000)
    return result


async def character_model_scope(agent_id: str):
    token=config_scope.set(agent_config_path(agent_id))
    try:yield
    finally:config_scope.reset(token)

character_models_router=APIRouter(prefix='/api/agents/{agent_id}/models',tags=['Character-owned models'],dependencies=[Depends(character_model_scope)])
for entry in list(router.routes):
    character_models_router.add_api_route(entry.path.removeprefix('/api/models'),entry.endpoint,methods=list(entry.methods),response_model=entry.response_model)
