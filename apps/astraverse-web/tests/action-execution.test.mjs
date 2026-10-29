import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = await readFile(new URL('../src/features/agents/actionExecution.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date, setTimeout, require: () => ({ readResponse: async response => response }) });
test('play confirmation waits for the requested source and real ready/play state', async () => {
  const audio = { src: 'new', currentSrc: 'old', paused: false, ended: false, readyState: 4 };
  let done = false;
  const waiting = exports.waitForPlayback(audio, 'new', () => true).then(status => { done = true; return status; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(done, false);
  audio.currentSrc = 'new';
  assert.equal(await waiting, 'confirmed');
});
test('manual cancellation and source failures cannot confirm or trigger a follow-up', async () => {
  const audio = { src: 'new', currentSrc: 'new', paused: false, ended: false, readyState: 4 };
  assert.equal(await exports.waitForPlayback(audio, 'new', () => false), 'cancelled');
  audio.paused = true; audio.error = { code: 4 };
  assert.equal(await exports.waitForPlayback(audio, 'new', () => true), 'failed');
  assert.equal(await exports.waitForPlayback(null, 'new', () => true), 'failed');
});
