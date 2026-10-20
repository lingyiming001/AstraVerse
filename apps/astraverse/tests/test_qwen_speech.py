"""Qwen protocol and compatibility checks: all provider requests are mocked."""
import json
import io
import struct
import wave
import httpx
import pytest
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.models import router as models

client = TestClient(app)
buffer = io.BytesIO()
with wave.open(buffer, 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(24000)
    audio.writeframes(b'\0\0' * 24)
WAV = buffer.getvalue()


def configure(backend='dashscope'):
    payload = {'providers': [{'id': 'cloud', 'name': 'cloud', 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'api_key': 'private-test-key', 'models': [{'id': 'qwen3-tts-flash', 'capabilities': ['speech'], 'speech_backend': backend, 'speech_voice': 'Cherry', 'speech_language': 'Chinese'}, {'id': 'whisper', 'capabilities': ['transcription']}]}], 'routes': {'speech': {'primary': {'provider': 'cloud', 'model': 'qwen3-tts-flash'}}, 'transcription': {'primary': {'provider': 'cloud', 'model': 'whisper'}}}}
    response = client.put('/api/models/settings', json=payload)
    assert response.status_code == 200
    assert 'private-test-key' not in response.text
    return response.json()


def transport(monkeypatch, handler):
    monkeypatch.setattr(models, 'client_for', lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_qwen_native_protocol_download_and_key_isolation(monkeypatch):
    config = configure()
    seen = []
    def handler(request):
        seen.append(request)
        if request.method == 'POST':
            assert request.url.path == '/api/v1/services/aigc/multimodal-generation/generation'
            assert request.headers['Authorization'] == 'Bearer private-test-key'
            assert json.loads(request.content)['input'] == {'text': '你好', 'voice': 'Cherry', 'language_type': 'Chinese'}
            return httpx.Response(200, json={'output': {'audio': {'url': 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav?Signature=test'}}})
        assert request.url.scheme == 'https'
        assert 'authorization' not in request.headers
        return httpx.Response(200, content=WAV)
    transport(monkeypatch, handler)
    result = client.post('/api/models/infer', json={'capability': 'speech', 'prompt': '你好', 'voice': 'nova'})
    assert result.status_code == 200
    assert result.headers['content-type'] == 'audio/wav'
    assert result.content == WAV and len(seen) == 2
    assert config['routes']['transcription']['primary']['model'] == 'whisper'
    config['providers'][0].pop('key_configured')
    assert client.put('/api/models/settings', json=config).status_code == 200
    assert models.load_settings().providers[0].api_key == 'private-test-key'


@pytest.mark.parametrize("voice", ["Serena", "Eldric Sage"])
def test_explicit_qwen_voice_and_character_scope(monkeypatch, voice):
    configure()
    config = json.loads(models.CONFIG_PATH.read_text())
    private_path = models.agent_config_path('character-0')
    private_path.parent.mkdir()
    private_path.write_text(json.dumps(config))
    from astraverse.modules.agents import profiles
    profiles.PROFILES.write_text(json.dumps({'character-0': {'id': 'character-0', 'name': '伙伴', 'model_scope': 'character'}}))
    def handler(request):
        if request.method == 'POST':
            assert json.loads(request.content)['input']['voice'] == voice
            return httpx.Response(200, json={'output': {'audio': {'url': 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav'}}})
        return httpx.Response(200, content=WAV)
    transport(monkeypatch, handler)
    response = client.post('/api/models/infer', json={'agent_id': 'character-0', 'capability': 'speech', 'prompt': '你好', 'voice': voice})
    assert response.status_code == 200


@pytest.mark.parametrize('url', ['http://127.0.0.1/secret', 'https://evil.example/audio.wav', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.example/audio.wav'])
def test_rejects_untrusted_audio_urls_without_downloading(monkeypatch, url):
    configure()
    seen = []
    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={'output': {'audio': {'url': url}}})
    transport(monkeypatch, handler)
    assert client.post('/api/models/infer', json={'capability': 'speech', 'prompt': '你好'}).status_code == 502
    assert len(seen) == 1


def test_limit_rejected_before_billable_request(monkeypatch):
    configure()
    def handler(request):
        pytest.fail('Over-limit request must not reach provider')
    transport(monkeypatch, handler)
    assert client.post('/api/models/infer', json={'capability': 'speech', 'prompt': '你' * 601}).status_code == 422


def test_qwen_errors_do_not_retry_or_expose_secrets(monkeypatch):
    configure()
    seen = []
    def handler(request):
        seen.append(request)
        return httpx.Response(401, json={'message': 'private-test-key'})
    transport(monkeypatch, handler)
    response = client.post('/api/models/infer', json={'capability': 'speech', 'prompt': '你好'})
    assert response.status_code == 502 and 'private-test-key' not in response.text
    assert len(seen) == 1


def test_openai_tts_and_asr_remain_available(monkeypatch):
    configure('openai')
    def handler(request):
        if request.url.path.endswith('/audio/speech'):
            assert json.loads(request.content)['voice'] == 'nova'
            return httpx.Response(200, content=b'mp3', headers={'Content-Type': 'audio/mpeg'})
        assert request.url.path.endswith('/audio/transcriptions')
        return httpx.Response(200, json={'text': '原有ASR保留'})
    transport(monkeypatch, handler)
    assert client.post('/api/models/infer', json={'capability': 'speech', 'prompt': '你好'}).content == b'mp3'
    response = client.post('/api/models/infer', json={'capability': 'transcription', 'prompt': '转写', 'attachments': [{'mime': 'audio/wav', 'data': 'UklGRg=='}]})
    assert response.status_code == 200 and response.json()['text'] == '原有ASR保留'


def test_streaming_wav_header_is_finalized_without_changing_samples():
    from astraverse.modules.models.adapters.audio import finalize_wav
    streamed = bytearray(WAV)
    struct.pack_into('<I', streamed, 4, 0x7fffffbf)
    struct.pack_into('<I', streamed, 40, 0x7fffff9b)
    assert finalize_wav(bytes(streamed)) == WAV
    with wave.open(io.BytesIO(finalize_wav(bytes(streamed))), 'rb') as audio:
        assert audio.getnframes() == 24
