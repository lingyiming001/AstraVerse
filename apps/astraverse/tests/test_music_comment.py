import asyncio
from astraverse.api import application as api

def test_music_comment_uses_character_and_throttles(monkeypatch):
    calls=[]
    async def conversation(*args, **kwargs):
        calls.append(kwargs)
        return {'text':'光看这个名字，就让我想到安静的午后。'}
    monkeypatch.setattr(api,'conversation',conversation)
    monkeypatch.setattr(api,'music_comment_times',{})
    async def run():
        body=api.MusicCommentRequest(agent_id='character-0',title='午后',description='轻松音乐')
        first=await api.music_comment(body)
        second=await api.music_comment(body)
        assert first['text'] and not second['text']
        assert len(calls)==1
        assert '没有听取音频或歌词' in calls[0]['system']
        assert 'personality' in calls[0]['system']
    asyncio.run(run())
