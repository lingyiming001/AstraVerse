import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = await readFile(new URL('../src/features/library/importConflicts.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const resource = (id, filename, kind = 'book', source = 'upload') => ({ id, filename, kind, source });
test('duplicates use original filenames and kind, not display titles or builtin names', () => {
  const existing = resource('old', 'Novel.EPUB'); existing.name = 'Renamed display title';
  assert.equal(exports.duplicateResource('novel.epub', 'book', [existing]), existing);
  assert.equal(exports.duplicateResource('novel.epub', 'music', [existing]), undefined);
  assert.equal(exports.duplicateResource('novel.epub', 'book', [resource('built', 'novel.epub', 'book', 'builtin')]), undefined);
});
test('keep both reserves a distinct filename against existing and batch-imported resources', () => {
  const catalog = [resource('a', 'novel.epub'), resource('b', 'novel (2).epub')];
  assert.equal(exports.availableFilename('novel.epub', 'book', catalog), 'novel (3).epub');
  catalog.push(resource('c', 'novel (3).epub'));
  assert.equal(exports.availableFilename('novel.epub', 'book', catalog), 'novel (4).epub');
});
