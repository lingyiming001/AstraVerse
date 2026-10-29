import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), exports = {};
const source = await readFile(new URL('../src/features/stage/performance.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, performance, setTimeout, clearTimeout, require: path => path.includes('live2dControl') ? { validateLive2DDirective: () => undefined } : require(path) });
test('thinking and delayed response cues preserve an active manual control window', () => {
  exports.pauseAutomaticPerformance(9000);
  const until = exports.usePerformance.getState().manualUntil;
  exports.beginTurn();
  assert.equal(exports.usePerformance.getState().manualUntil, until);
  exports.respond({ emotion: 'happy', gesture: 'open', energy: 1 });
  assert.equal(exports.usePerformance.getState().cue, null);
  assert.equal(exports.usePerformance.getState().manualUntil, until);
  exports.endTurn();
});
