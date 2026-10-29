import asyncio
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient
from astraverse.api.application import app
from astraverse.modules.resources import reading, library


def api(): return TestClient(app)


def upload(client, text, book='honglou', name='红楼梦.txt'):
    response = client.put(f'/api/library/books/{book}/file', params={'filename': name, 'title': '红楼梦'}, content=text.encode('utf-8'))
    assert response.status_code == 200, response.text
    return response.json()


def choose(client, book='honglou', agent='reader-a', **extra):
    result = client.put(f'/api/library/reading/{agent}', json={'book_id': book, **extra})
    assert result.status_code == 200, result.text
    return result.json()['reading']


def next_part(client, agent='reader-a', owner='browser-one'):
    response = client.post(f'/api/library/reading/{agent}/next', json={'client_id': owner})
    assert response.status_code == 200, response.text
    return response.json()['chunk']


def ack(client, part, agent='reader-a', owner='browser-one'):
    return client.post(f'/api/library/reading/{agent}/ack', json={'book_id': part['book_id'], 'token': part['token'], 'client_id': owner})


def test_entire_novel_coverage_and_chapter_boundaries():
    # More than a million characters, far beyond model context or the old 2k excerpt.
    text = ''.join(f'第{i}回 章节{i}\n\n' + (f'这一段是第{i}回的连续正文，句子不应遗漏，也不应重复。\n\n' * 400) for i in range(1, 121))
    headings = reading.chapters(text)
    assert len(headings) == 120 and len(text) > 1_000_000
    offset = 0; pieces = []
    while offset < len(text):
        end = reading.segment(text, offset, headings)
        assert offset < end <= min(len(text), offset + 600)
        assert not any(offset < h['offset'] < end for h in headings)
        pieces.append(text[offset:end]); offset = end
    assert ''.join(pieces) == text


def test_persistent_position_ack_only_and_complete_without_a_model():
    client = api(); text = ''.join(f'第{i}回 正文\n' + '原文必须逐字朗读。' * 80 + '\n\n' for i in range(1, 7)).rstrip()
    upload(client, text); choose(client)
    first = next_part(client)
    assert next_part(client) == first
    assert client.get('/api/library/reading/reader-a').json()['reading']['offset'] == 0
    assert ack(client, first).json()['reading']['offset'] == first['end']
    assert ack(client, first).json()['reading']['offset'] == first['end']  # Idempotent retry.
    restored = api().get('/api/library/reading/reader-a').json()['reading']
    assert restored['offset'] == first['end']  # Fresh request/connection, no runtime cache.
    client = api(); spoken = [first['text']]
    while True:
        part = next_part(client)
        if part is None: break
        assert part['text'] == text[part['start']:part['end']]
        spoken.append(part['text'])
        result = ack(client, part)
        assert result.status_code == 200
    assert ''.join(spoken) == text
    info = client.get('/api/library/reading/reader-a').json()['reading']
    assert info['completed'] and not info['active'] and info['offset'] == len(text)


def test_pause_and_seek_invalidate_late_audio_and_resume_unfinished_segment():
    client = api(); text = '第1回 开头\n' + '不可跳过任何原文。' * 160 + '\n第2回 下一章\n第二回正文。'
    upload(client, text); choose(client)
    first = next_part(client)
    choose(client, active=False)
    assert ack(client, first).status_code == 409
    choose(client); resumed = next_part(client)
    assert resumed['text'] == first['text'] and resumed['token'] != first['token']
    second = reading.chapters(text)[1]['offset']
    choose(client, position=second)
    assert ack(client, resumed).status_code == 409
    assert next_part(client)['text'].startswith('第2回')
    choose(client, restart=True)
    assert next_part(client)['start'] == 0


def test_per_character_per_book_bookmarks_and_file_replacement():
    client = api(); text = '红楼原文。' * 300
    upload(client, text); upload(client, '另一部原文。' * 200, book='other')
    choose(client); part = next_part(client); ack(client, part)
    choose(client, book='other'); other = next_part(client); ack(client, other)
    assert choose(client)['offset'] == part['end']
    assert choose(client, agent='reader-b')['offset'] == 0
    assert not upload(client, text)['replaced']
    assert client.get('/api/library/reading/reader-a').json()['reading']['offset'] == part['end']
    assert upload(client, '替换后的新正文。')['replaced']
    info = client.get('/api/library/reading/reader-a').json()['reading']
    assert info['offset'] == 0 and not info['active']


def test_multi_browser_ownership_expiry_and_stale_cancel(monkeypatch):
    client = api(); upload(client, '连续正文。' * 500); choose(client)
    first = next_part(client)
    assert client.post('/api/library/reading/reader-a/next', json={'client_id': 'browser-two'}).status_code == 409
    with reading.db() as c: c.execute('UPDATE book_progress SET lease=0')
    takeover = next_part(client, owner='browser-two')
    assert takeover['start'] == first['start'] and takeover['token'] != first['token']
    assert ack(client, first).status_code == 409
    client.post('/api/library/reading/reader-a/cancel', json={'book_id': 'honglou', 'token': first['token'], 'client_id': 'browser-one'})
    assert client.get('/api/library/reading/reader-a').json()['reading']['active']
    assert ack(client, takeover, owner='browser-two').status_code == 200


def test_private_books_never_read_or_enter_context_during_public_live(monkeypatch):
    client = api(); upload(client, 'SECRET_PRIVATE_BOOK。' * 100)
    asyncio.run(library.access_save('honglou', library.Access(agents=['reader-a'])))
    assert client.put('/api/library/reading/reader-b', json={'book_id': 'honglou'}).status_code == 403
    choose(client)
    assert reading.reading_context('reader-a')
    assert reading.reading_context('reader-a', public=True) == ''
    monkeypatch.setattr(reading, 'public_session', lambda _: True)
    assert client.post('/api/library/reading/reader-a/next', json={'client_id': 'browser-one'}).status_code == 403
    assert client.put('/api/library/reading/reader-a', json={'book_id': 'honglou'}).status_code == 403
    choose(client, active=False)


def test_encoding_epub_spine_order_and_invalid_files():
    client = api()
    raw = '第一回　原文\n你好，红楼梦。'.encode('gb18030')
    response = client.put('/api/library/books/gb/file', params={'filename': '红楼梦.txt', 'title': '红楼梦'}, content=raw)
    assert response.status_code == 200
    choose(client, book='gb'); assert '你好，红楼梦。' in next_part(client)['text']
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as z:
        z.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
        z.writestr('OPS/book.opf', '<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>')
        z.writestr('OPS/a.xhtml', '<html><head><style>HIDDEN</style></head><body><h1>第2回 后文</h1><p>后面的正文。</p></body></html>')
        z.writestr('OPS/b.xhtml', '<html><body><h1>第1回 开头</h1><p>先读这一段。</p><script>DO_NOT_EXECUTE</script></body></html>')
    text = reading.extract(output.getvalue(), '小说.epub')
    assert text.index('第1回') < text.index('第2回') and 'HIDDEN' not in text and 'DO_NOT_EXECUTE' not in text
    assert len(reading.chapters(text)) == 2
    for name, raw in [('空.txt', b' '), ('坏.epub', b'not-a-zip'), ('扫描.pdf', b'%PDF')]:
        assert client.put('/api/library/books/invalid/file', params={'filename': name, 'title': name}, content=raw).status_code == 422


def test_running_reading_suspends_idle_chat_and_public_context_is_bounded(monkeypatch):
    from astraverse.modules.live import service
    client = api(); upload(client, '阅读中的具体原文。' * 1000); choose(client)
    state = service.Runtime(); state.status = 'waiting'
    monkeypatch.setattr(service, 'rt', lambda _: state)
    monkeypatch.setattr(service, 'channel', lambda _: {'agent_id': 'reader-a'})
    async def forbidden(*args): raise AssertionError('读书时不应生成新杂谈')
    monkeypatch.setattr(service, 'idle_handler', forbidden)
    asyncio.run(service.maybe_idle('test'))
    context = reading.reading_context('reader-a', public=True)
    assert '阅读中的具体原文' in context and len(context) < 1500
    client.delete('/api/library/books/honglou')
    assert client.get('/api/library/reading/reader-a').json()['reading'] is None


def test_stopping_live_or_reaching_deadline_pauses_reading_without_losing_position(monkeypatch):
    from astraverse.modules.live import service
    client = api(); upload(client, '完整原文，不应跳过。' * 200); choose(client)
    first = next_part(client); ack(client, first)
    unfinished = next_part(client)
    state = service.Runtime(); state.status = 'connected'
    monkeypatch.setattr(service, 'rt', lambda _: state)
    monkeypatch.setattr(service, 'load', lambda: {'room': {'agent_id': 'reader-a'}})
    monkeypatch.setattr(service, 'channel', lambda _: {'agent_id': 'reader-a'})
    events = []
    async def emit(_, event): events.append(event)
    monkeypatch.setattr(service, 'emit', emit)
    asyncio.run(service.stop('room'))
    info = client.get('/api/library/reading/reader-a').json()['reading']
    assert not info['active'] and info['offset'] == first['end']
    assert ack(client, unfinished).status_code == 409
    assert events[-1]['reading_agent_id'] == 'reader-a'
    choose(client); state.solo = {'reason': ''}; state.status = 'connected'
    asyncio.run(service.end_solo('room', 'ended', '直播到时'))
    info = client.get('/api/library/reading/reader-a').json()['reading']
    assert not info['active'] and info['offset'] == first['end']
