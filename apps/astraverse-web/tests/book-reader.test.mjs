import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/library/useBookReader.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup({ failAck = false, deferredStatus = false, readToEnd = true } = {}) {
  let server = { book_id: 'novel', title: '红楼梦', offset: 0, total: 900, active: true };
  let view = { reading: server, text: '', error: '', revision: 0 };
  let cleanup, timer, release;
  const queue = [], requests = [];
  class ReadingError extends Error { constructor(status) { super('request failed'); this.status = status; } }
  const reading = {
    ReadingError,
    useBookReading: { getState: () => ({ readers: { a: view } }) },
    updateReader: (_, patch) => { view = { ...view, ...patch }; },
    invalidateReader: () => ++view.revision,
    selectBook: async (_, book_id, active) => { server = { ...server, book_id, active }; },
    readingRequest: async (_, path = '', method, body) => {
      requests.push({ path, body });
      if (path === '/ack') {
        if (failAck) { failAck = false; throw new ReadingError(503); }
        server = { ...server, offset: 320 };
      }
      if (path === '/cancel') server = { ...server, active: false };
      if (!path && deferredStatus) {
        deferredStatus = false;
        const old = { ...server };
        await new Promise(resolve => { release = resolve; });
        return { reading: old };
      }
      return { reading: { ...server } };
    },
  };
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: name => name === 'react' ? { useEffect: fn => { cleanup = fn(); } } :
      name.includes('playbackConfig') ? { readPlaybackConfig: () => ({ bookSegmentChars:120, prefetch:true }) } :
      name.includes('preferences') ? { usePreferences: { getState: () => ({ voice: true, bookReadToEnd: readToEnd }) } } :
      name.includes('workspaceStore') ? { useWorld: { getState: () => ({ clientId: 'page' }) } } :
      name.includes('agentApi') ? { useAgents: { getState: () => ({ profiles: {} }) } } :
      name.includes('chat/speech') ? { enqueueLiveSpeech: item => queue.push(item), stopBookSpeech() {} } : reading,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ chunk: { book_id: 'novel', token: `at-${server.offset}`, start: server.offset, end: server.offset + 320, text: '连续原文' } }) }),
    setInterval: fn => { timer = fn; return 1; }, clearInterval() {}, AbortSignal, AbortController,
  });
  exports.useBookReader('a');
  return { queue, requests, tick: () => timer(), release: () => release(), invalidate: () => reading.invalidateReader(), view: () => view, cleanup: () => cleanup() };
}

test('book playback acknowledges exactly after completion, then queues the next segment', async () => {
  const h = setup(); await flush();
  assert.equal(h.queue.length, 1); assert.equal(h.requests.filter(r => r.path === '/ack').length, 0);
  h.queue[0].onEnd(); await flush();
  assert.equal(h.requests.filter(r => r.path === '/ack').length, 1);
  assert.equal(h.queue.length, 2); assert.equal(h.view().reading.offset, 320);
});

test('cancellation pauses without advancing; a late end cannot save a cancelled segment', async () => {
  const h = setup(); await flush();
  h.queue[0].onCancel(); await flush(); h.queue[0].onEnd(); await flush();
  assert.equal(h.requests.filter(r => r.path === '/ack').length, 0);
  assert.equal(h.requests.filter(r => r.path === '/cancel').length, 1);
  assert.equal(h.view().reading.active, false);
});

test('a temporary bookmark save failure retries acknowledgement before another segment', async () => {
  const h = setup({ failAck: true }); await flush();
  h.queue[0].onEnd(); await flush();
  assert.equal(h.queue.length, 1); assert.match(h.view().error, /重试保存/);
  h.tick(); await flush();
  assert.equal(h.requests.filter(r => r.path === '/ack').length, 2);
  assert.equal(h.queue.length, 2); assert.equal(h.view().reading.offset, 320);
});

test('a delayed pre-pause request cannot enqueue audio after a reader action', async () => {
  const h = setup({ deferredStatus: true }); await flush();
  h.invalidate(); h.release(); await flush();
  assert.equal(h.queue.length, 0);
});

 test('single segment mode saves completion before pausing and never queues the next chunk', async () => {
  const h = setup({ readToEnd: false }); await flush();
  h.queue[0].onEnd(); await flush();
  assert.equal(h.requests.filter(r => r.path === '/ack').length, 1);
  assert.equal(h.view().reading.offset, 320);
  assert.equal(h.queue.length, 1);
  h.tick(); await flush(); assert.equal(h.queue.length, 1);
});
