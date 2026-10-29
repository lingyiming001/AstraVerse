import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/features/live2d/interactionMotion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { interactionMotion } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('touch chooses only an authored group that matches the hit area', () => {
  assert.equal(interactionMotion(['Idle', 'TapHead', 'TapBody'], ['Head']), 'TapHead');
  assert.equal(interactionMotion(['Idle', 'TapHead', 'TapBody'], ['Body']), 'TapBody');
  assert.equal(interactionMotion(['Idle', 'Tap'], ['Body']), 'Tap');
  assert.equal(interactionMotion(['Idle'], ['Body']), null);
  assert.equal(interactionMotion(['Tap'], []), null);
});
