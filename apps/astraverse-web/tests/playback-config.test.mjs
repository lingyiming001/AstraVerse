import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/shared/preferences/playbackConfig.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {exports, localStorage:{ getItem:()=>'{bad json' }});
test('corrupt saved preferences fall back to usable defaults', () => {
  assert.equal(exports.readPlaybackConfig().captionChars, 40);
  assert.equal(exports.readPlaybackConfig().prefetch, true);
});
test('bounds protect two-line subtitles and audio segment budgets', () => {
  const c = exports.normalizePlaybackConfig({captionChars:999,captionLead:-1,bookSegmentChars:Infinity,prefetch:false});
  assert.equal(c.captionChars,40);
  assert.equal(c.captionLead,0);
  assert.equal(c.bookSegmentChars,120);
  assert.equal(c.prefetch,false);
});
