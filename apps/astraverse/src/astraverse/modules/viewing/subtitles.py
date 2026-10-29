"""Read public Bilibili subtitle tracks for the selected video part only."""
from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix='/api/watch', tags=['Video subtitles'])
HEADERS = {'User-Agent': 'Mozilla/5.0 (AstraVerse local subtitle viewer)', 'Referer': 'https://www.bilibili.com/'}


def valid_track_url(raw: str) -> str:
    url = urlparse('https:' + raw if raw.startswith('//') else raw)
    if url.scheme != 'https' or url.hostname not in {'aisubtitle.hdslb.com', 'api.bilibili.com'} or url.username or url.password or url.port or not url.path.endswith('.json'):
        raise ValueError('字幕地址不属于受支持的 B 站服务')
    return url.geturl()


async def get_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict:
    response = await client.get(url, params=params, follow_redirects=False)
    response.raise_for_status()
    if len(response.content) > 2_000_000:
        raise ValueError('字幕响应过大')
    payload = response.json()
    if not isinstance(payload, dict) or payload.get('code', 0) != 0:
        raise ValueError('平台未提供可用字幕')
    return payload


@router.get('/bilibili-subtitles')
async def bilibili_subtitles(bvid: str = Query(pattern=r'^BV[a-zA-Z0-9]{10}$'), p: int = Query(default=1, ge=1, le=10000)):
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=8.0, trust_env=True) as client:
            video = (await get_json(client, 'https://api.bilibili.com/x/web-interface/view', {'bvid': bvid})).get('data') or {}
            if video.get('bvid') != bvid:
                raise ValueError('视频编号与平台响应不一致')
            pages = video.get('pages') or []
            part = next((item for item in pages if item.get('page') == p), None)
            if not part or not isinstance(part.get('cid'), int):
                raise ValueError('找不到该视频分集')
            player = (await get_json(client, 'https://api.bilibili.com/x/player/wbi/v2', {'bvid': bvid, 'aid': video['aid'], 'cid': part['cid']})).get('data') or {}
            tracks = ((player.get('subtitle') or {}).get('subtitles') or [])
            tracks = [item for item in tracks if isinstance(item, dict) and isinstance(item.get('subtitle_url'), str)]
            if not tracks:
                return {'status': 'unavailable', 'reason': '平台未向当前未登录会话提供公开字幕；可导入 SRT/VTT 字幕文件。', 'cues': []}
            track = next((item for item in tracks if re.search(r'zh|中文', str(item.get('lan', '')) + str(item.get('lan_doc', '')), re.I)), tracks[0])
            subtitle_url = valid_track_url(track['subtitle_url'])
            body = (await get_json(client, subtitle_url)).get('body') or []
            cues = []
            for item in body[:10000]:
                if not isinstance(item, dict):
                    continue
                start, end, content = item.get('from'), item.get('to'), item.get('content')
                if isinstance(start, (int, float)) and isinstance(end, (int, float)) and 0 <= start < end <= 10_000_000 and isinstance(content, str) and content.strip():
                    cues.append({'start': start, 'end': end, 'text': content.strip()[:500]})
            return {'status': 'ready', 'language': track.get('lan_doc') or track.get('lan') or '', 'cues': cues}
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(502, f'读取平台字幕失败：{exc}') from exc
