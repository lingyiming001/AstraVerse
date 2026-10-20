"""Finalize downloaded RIFF/WAV files whose streaming headers use unknown sizes."""
import io
import struct
import wave


def finalize_wav(payload: bytes) -> bytes:
    if payload[:4] != b'RIFF' or payload[8:12] != b'WAVE':
        raise ValueError('Expected WAV audio')
    result = bytearray(payload)
    struct.pack_into('<I', result, 4, len(result) - 8)
    offset = 12
    found_data = False
    while offset + 8 <= len(result):
        name, size = struct.unpack_from('<4sI', result, offset)
        available = len(result) - offset - 8
        if name == b'data':
            found_data = True
            if size > available:
                struct.pack_into('<I', result, offset + 4, available)
            break
        if size > available:
            raise ValueError('Incomplete WAV metadata')
        offset += 8 + size + size % 2
    if not found_data:
        raise ValueError('Missing WAV audio data')
    try:
        with wave.open(io.BytesIO(result), 'rb') as audio:
            if audio.getnframes() == 0:
                raise ValueError('Empty WAV audio')
    except (wave.Error, EOFError) as exc:
        raise ValueError('Invalid WAV audio') from exc
    return bytes(result)
