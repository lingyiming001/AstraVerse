"""DashScope Qwen3-TTS non-streaming REST adapter."""
import re
from urllib.parse import urlsplit, urlunsplit
import httpx
from fastapi import HTTPException
from astraverse.modules.models.adapters.audio import finalize_wav

REGIONS = {'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'}
LEGACY_VOICES = {'nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'}
MAX_AUDIO_BYTES = 32 * 1024 * 1024


async def synthesize(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    api_key: str | None,
    model: str,
    text: str,
    voice: str | None,
    default_voice: str,
    language: str,
) -> bytes:
    host = urlsplit(base_url).hostname
    if host not in REGIONS:
        raise HTTPException(422, 'Qwen百炼协议需要官方DashScope地域地址；兼容服务请使用OpenAI语音协议')
    if not api_key:
        raise HTTPException(409, '请先保存该地域的百炼API Key')
    if len(text) > 600:
        raise HTTPException(422, 'Qwen3-TTS单次最多600字符，请缩短朗读文本')
    chosen_voice = default_voice if not voice or voice in LEGACY_VOICES else voice
    response = await client.post(
        f'https://{host}/api/v1/services/aigc/multimodal-generation/generation',
        headers={'Authorization': f'Bearer {api_key}'},
        json={
            'model': model,
            'input': {'text': text, 'voice': chosen_voice, 'language_type': language},
        },
    )
    response.raise_for_status()
    result = response.json()
    if result.get('code') or result.get('status_code', 200) != 200:
        raise ValueError('Qwen speech synthesis failed')
    audio = result['output']['audio']
    # The non-streaming endpoint returns the full WAV at a signed OSS URL.
    url = urlsplit(audio['url'])
    safe_host = re.fullmatch(
        r'dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com',
        url.hostname or '',
    )
    if (
        url.scheme not in ('http', 'https')
        or url.username or url.password
        or url.port not in (None, 80, 443)
        or not safe_host
    ):
        raise ValueError('Unexpected Qwen audio download host')
    download = urlunsplit(('https', url.hostname, url.path, url.query, ''))
    # Never forward the provider API key to the signed download endpoint.
    async with client.stream('GET', download) as response:
        response.raise_for_status()
        if int(response.headers.get('content-length', '0')) > MAX_AUDIO_BYTES:
            raise ValueError('Qwen audio exceeds download budget')
        data = bytearray()
        async for chunk in response.aiter_bytes():
            data.extend(chunk)
            if len(data) > MAX_AUDIO_BYTES:
                raise ValueError('Qwen audio exceeds download budget')
    return finalize_wav(bytes(data))
