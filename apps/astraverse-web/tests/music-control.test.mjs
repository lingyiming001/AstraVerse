import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = await readFile(new URL('../src/features/music/musicControl.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
test('natural stop requests execute but questions, discussion and negation do not', () => {
  for (const input of ['暂停音乐', '先把音乐暂停一下吧', '音乐停一下', '请关掉背景音乐', '别放歌了', '停止播放', '暂停']) assert.equal(exports.musicPauseIntent(input), true, input);
  for (const input of ['不要暂停音乐', '为什么音乐暂停了', '音乐暂停了吗？', '如果暂停音乐会怎样', '暂停阅读', '我喜欢这首歌', '不要暂停音乐，继续播放']) assert.equal(exports.musicPauseIntent(input), false, input);
});
test('pause invokes the real media element and verifies its paused state', () => {
  const states = [];
  const element = { paused: false, currentTime: 42, pause() { this.paused = true; } };
  assert.equal(exports.pauseMusic(element, value => states.push(value)), true);
  assert.deepEqual(states, [false]);
  assert.equal(element.currentTime, 42);
  assert.equal(exports.pauseMusic({ paused: false, pause() {} }, () => {}), false);
  assert.equal(exports.pauseMusic({ paused: false, pause() { throw new Error('device error'); } }, () => {}), false);
});
