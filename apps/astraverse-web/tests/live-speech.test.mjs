import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/chat/speech.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
test('task identity and actual system boundaries survive cancellation and repeated text', async () => {
  const s = setup();
  s.enqueueLiveSpeech({ text:'同样的文字', key:'book:a', agentId:'a' });
  await tick();
  const first = s.speechClock().taskId;
  s.spoken[0].onboundary({charIndex:3});
  assert.equal(s.speechClock().charIndex,3);
  s.stopBookSpeech('a');
  assert.equal(s.useSpeech.getState().outcome,'cancelled');
  s.enqueueLiveSpeech({ text:'同样的文字', key:'book:a', agentId:'a' });
  await tick();
  assert.notEqual(s.speechClock().taskId,first);
  s.spoken[0].onboundary({charIndex:5});
  assert.equal(s.speechClock().charIndex,undefined);
  s.spoken[1].onend();
  assert.equal(s.useSpeech.getState().outcome,'completed');
});

test('continuous 100-segment playback completes once each without queue overlap', async () => {
  const s = setup(); let completed = 0;
  for (let i=0;i<100;i++) s.enqueueLiveSpeech({text:`第${i}段`,key:'book:a',agentId:'a',onEnd:()=>completed++});
  for (let i=0;i<100;i++) {
    await tick();
    assert.equal(s.spoken.length,i+1);
    s.spoken[i].onend();
    s.spoken[i].onend();
  }
  await tick();
  assert.equal(completed,100);
  assert.equal(s.useSpeech.getState().phase,'idle');
});
function setup({ model = false } = {}) {
  let state;
  const listeners = new Set();
  const create = init => {
    state = init();
    const store = () => state;
    store.getState = () => state;
    store.setState = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); };
    store.subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
    return store;
  };
  const spoken = []; const audio = []; let cancels = 0;
  class FakeAudio {
    paused = true; ended = false;
    constructor() { audio.push(this); }
    async play() { this.paused = false; this.onplay?.(); }
    pause() { this.paused = true; this.onpause?.(); }
  }
  const speechSynthesis = { cancel: () => { cancels++; }, speak: utterance => { spoken.push(utterance); utterance.onstart?.(); } };
  const exports = {};
  vm.runInNewContext(js, {
    exports, require: name => name === 'zustand' ? { create } : name.includes('workspaceStore') ?
      { useWorld: { getState: () => ({ volume: 100, set() {} }) } } : { readResponse: response => response.json() },
    window: { speechSynthesis, dispatchEvent() {} }, speechSynthesis,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    fetch: async () => ({ ok: true, json: async () => ({ configured: model }), blob: async () => new Blob(['audio']) }),
    Audio: FakeAudio, URL, Blob, AbortController, setTimeout, clearTimeout, cancelAnimationFrame() {}, CustomEvent: class {},
  });
  return { ...exports, spoken, audio, cancels: () => cancels };
}

test('a live reply waits for the complete utterance instead of interrupting it', async () => {
  const s = setup();
  const expressions = [];
  s.enqueueLiveSpeech({ text: '还没说完的第一句', key: 'live-idle:one', agentId: 'a', onStart: () => expressions.push('first') });
  await tick();
  const cancels = s.cancels();
  s.enqueueLiveSpeech({ text: '回应弹幕的第二句', key: 'live:one', agentId: 'a', onStart: () => expressions.push('second') });
  await tick();
  assert.equal(s.spoken.length, 1); assert.equal(s.cancels(), cancels);
  assert.deepEqual(expressions, ['first']);
  s.spoken[0].onend();
  await tick();
  assert.equal(s.spoken.length, 2); assert.equal(s.spoken[1].text, '回应弹幕的第二句');
  assert.deepEqual(expressions, ['first', 'second']);
});

test('stopping clears pending live speech and late end callbacks cannot restart it', async () => {
  const s = setup();
  s.enqueueLiveSpeech({ text: '第一句', key: 'live-idle:one', agentId: 'a' });
  await tick();
  s.enqueueLiveSpeech({ text: '排队的第二句', key: 'live:one', agentId: 'a' });
  s.stopCharacterSpeech(); s.spoken[0].onend();
  await tick();
  assert.equal(s.spoken.length, 1); assert.equal(s.useSpeech.getState().phase, 'idle');
});

test('a failed utterance releases the queue for the next reply', async () => {
  const s = setup();
  s.enqueueLiveSpeech({ text: '第一句', key: 'live:one', agentId: 'a' });
  await tick();
  s.enqueueLiveSpeech({ text: '下一句', key: 'live:one', agentId: 'a' });
  s.spoken[0].onerror({ error: 'audio-busy' });
  await tick();
  assert.equal(s.spoken.length, 2);
});

test('stopping a queued room removes its speech even while another room is speaking', async () => {
  const s = setup();
  s.enqueueLiveSpeech({ text: '房间一', key: 'live:one', agentId: 'a' });
  await tick();
  s.enqueueLiveSpeech({ text: '房间二', key: 'live:two', agentId: 'a' });
  s.stopLiveSpeech('two');
  s.spoken[0].onend();
  await tick();
  assert.equal(s.spoken.length, 1);
});

test('bookmarks receive a completion callback only after a natural system speech end', async () => {
  const s = setup(); const events = [];
  s.enqueueLiveSpeech({ text: '红楼原文', key: 'book:a', agentId: 'a', onEnd: () => events.push('completed'), onCancel: () => events.push('cancelled') });
  await tick(); assert.deepEqual(events, []);
  s.stopBookSpeech('a'); s.spoken[0].onend(); await tick();
  assert.deepEqual(events, ['cancelled']);
  s.enqueueLiveSpeech({ text: '重读同一段', key: 'book:a', agentId: 'a', onEnd: () => events.push('completed') });
  await tick(); s.spoken[1].onend(); s.spoken[1].onend(); await tick();
  assert.deepEqual(events, ['cancelled', 'completed']);
});

test('a model audio pause at EOF waits for ended; manual pause and failure do not acknowledge', async () => {
  const s = setup({ model: true }); const events = [];
  const item = { text: '书籍原文', key: 'book:a', agentId: 'a', onEnd: () => events.push('completed'), onCancel: () => events.push('cancelled'), onError: () => events.push('failed') };
  s.enqueueLiveSpeech(item); await tick();
  s.audio[0].ended = true; s.audio[0].pause();
  assert.deepEqual(events, []);
  s.audio[0].onended(); await tick();
  assert.deepEqual(events, ['completed']);
  s.enqueueLiveSpeech(item); await tick(); s.audio[1].pause(); await tick();
  assert.deepEqual(events, ['completed', 'cancelled']);
  s.enqueueLiveSpeech(item); await tick(); s.audio[2].onerror(); await tick();
  assert.deepEqual(events, ['completed', 'cancelled', 'failed']);
});

test('a conversational reply waits for the reading segment and runs its cue when actually spoken', async () => {
  const s = setup(); let bookmarks = 0; const cues = [];
  s.enqueueLiveSpeech({ text: '当前原文段落', key: 'book:a', agentId: 'a', onEnd: () => bookmarks++ });
  await tick();
  s.enqueueLiveSpeech({ text: '回应用户对这一段的提问', key: 'chat:a:one', agentId: 'a', onStart: () => cues.push('chat') });
  await tick();
  assert.equal(s.spoken.length, 1); assert.deepEqual(cues, []);
  s.spoken[0].onend(); await tick();
  assert.equal(bookmarks, 1); assert.equal(s.spoken.length, 2); assert.deepEqual(cues, ['chat']);
});
