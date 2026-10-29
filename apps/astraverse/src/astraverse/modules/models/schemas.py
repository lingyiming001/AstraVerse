"""Model registry contracts and validation, independent of HTTP and persistence."""
from __future__ import annotations
import base64
import ipaddress
from typing import Literal
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Capability = Literal['text', 'vision', 'image', 'speech', 'transcription', 'video', 'video_generate', 'embedding']
CAPABILITIES = ('text', 'vision', 'image', 'speech', 'transcription', 'video', 'video_generate', 'embedding')

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Model(StrictModel):
    id: str = Field(min_length=1, max_length=160, pattern=r'^\S+$')
    capabilities: list[Capability] = Field(min_length=1, max_length=8)
    speech_backend: Literal['openai', 'dashscope'] = 'openai'
    speech_voice: str = Field(default='Cherry', min_length=1, max_length=120, pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_.: -]*$')
    speech_language: Literal['Auto','Chinese','English','German','Italian','Portuguese','Spanish','Japanese','Korean','French','Russian'] = 'Auto'


class Provider(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    name: str = Field(min_length=1, max_length=80)
    base_url: str = Field(max_length=400)
    enabled: bool = True
    api_key: str | None = Field(default=None, max_length=4096, repr=False)
    clear_key: bool = Field(default=False, exclude=True)
    models: list[Model] = Field(default_factory=list, max_length=50)

    @field_validator('base_url')
    @classmethod
    def valid_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Use a clean HTTP(S) API base URL without credentials or query parameters')
        try: parsed.port
        except ValueError as exc: raise ValueError('Invalid API port') from exc
        local = parsed.hostname in ('localhost', '127.0.0.1', '::1')
        if parsed.scheme == 'http' and not local:
            raise ValueError('HTTP is only allowed for loopback local models; remote providers require HTTPS')
        try:
            address = ipaddress.ip_address(parsed.hostname)
        except ValueError:
            address = None
        if address and not address.is_global and not address.is_loopback:
            raise ValueError('Private network and metadata IP addresses are not allowed')
        return value.rstrip('/')

    @model_validator(mode='after')
    def unique_models(self) -> 'Provider':
        if len({m.id for m in self.models}) != len(self.models):
            raise ValueError('Model IDs must be unique within a provider')
        return self


class Target(StrictModel):
    provider: str = Field(max_length=64)
    model: str = Field(max_length=160)


class Route(StrictModel):
    primary: Target
    fallbacks: list[Target] = Field(default_factory=list, max_length=3)


class Settings(StrictModel):
    providers: list[Provider] = Field(default_factory=list, max_length=20)
    routes: dict[Capability, Route] = Field(default_factory=dict)
    timeout: int = Field(default=45, ge=5, le=180)
    max_tokens: int = Field(default=800, ge=64, le=8192)
    auto_text_route: bool = True

    @model_validator(mode='after')
    def validate_routes(self) -> 'Settings':
        providers = {p.id:p for p in self.providers}
        if len(providers) != len(self.providers):
            raise ValueError('Provider IDs must be unique')
        if self.auto_text_route and 'text' not in self.routes:
            for provider in self.providers:
                model=next((m for m in provider.models if 'text' in m.capabilities),None)
                if provider.enabled and model:
                    self.routes['text']=Route(primary=Target(provider=provider.id,model=model.id))
                    break
        for capability, route in self.routes.items():
            targets = [route.primary, *route.fallbacks]
            if len({(t.provider,t.model) for t in targets}) != len(targets):
                raise ValueError('A fallback cannot duplicate another route target')
            for target in targets:
                provider = providers.get(target.provider)
                model = next((m for m in provider.models if m.id == target.model), None) if provider else None
                if not provider or not model or capability not in model.capabilities:
                    raise ValueError(f'{capability}: target must reference a model with this capability')
        return self


class Attachment(StrictModel):
    mime: Literal['image/png','image/jpeg','image/webp','audio/wav','audio/mpeg']
    data: str = Field(min_length=1,max_length=12_000_000)

    @field_validator('data')
    @classmethod
    def valid_base64(cls, value: str) -> str:
        try: base64.b64decode(value,validate=True)
        except ValueError as exc: raise ValueError('Invalid base64 attachment') from exc
        return value


class InferenceRequest(StrictModel):
    agent_id: str | None = Field(default=None,max_length=120,pattern=r'^[a-zA-Z0-9_-]+$')
    capability: Capability
    prompt: str = Field(min_length=1,max_length=8000)
    attachments: list[Attachment] = Field(default_factory=list,max_length=8)
    voice: str | None = Field(default=None, min_length=1, max_length=120, pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_.: -]*$')

    @model_validator(mode='after')
    def input_budget(self) -> 'InferenceRequest':
        if sum(len(a.data) for a in self.attachments)>12_000_000:
            raise ValueError('Combined attachments exceed 9 MB decoded input budget')
        if not self.prompt.strip():
            raise ValueError('Prompt must not be blank')
        return self


class Probe(StrictModel):
    provider_id: str = Field(max_length=64)


class ModelTestRequest(StrictModel):
    provider_id: str = Field(min_length=1,max_length=64)
    model_id: str = Field(min_length=1,max_length=160)
