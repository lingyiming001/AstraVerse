import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = await readFile(new URL('../src/features/library/batchImport.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Error });
test('multiple imports run sequentially and continue after invalid and throwing files', async () => {
  let inFlight = 0;
  const called = [], progress = [];
  const files = ['song.mp3', 'invalid.txt', 'broken.epub', 'novel.epub'].map(name => ({ name }));
  const results = await exports.importBatch(files, async (file, report) => {
    assert.equal(++inFlight, 1);
    called.push(file.name);
    await new Promise(resolve => setImmediate(resolve));
    inFlight--;
    if (file.name === 'broken.epub') throw new Error('Cannot read file');
    report(file.name === 'invalid.txt' ? 'Unsupported format' : 'Saved');
    return file.name !== 'invalid.txt';
  }, snapshot => progress.push(snapshot));
  assert.deepEqual(called, files.map(f => f.name));
  assert.deepEqual(Array.from(results, r => r.ok), [true, false, false, true]);
  assert.equal(results[2].messages[0], 'Cannot read file');
  assert.deepEqual(progress.map(p => p.length), [1, 2, 3, 4]);
  assert.equal(progress[0].length, 1);
});

test('skipped duplicates are distinct from failed imports and later files still run', async () => {
  const results = await exports.importBatch([{ name: 'old.txt' }, { name: 'new.txt' }], async file => file.name === 'old.txt' ? 'skipped' : true, () => {});
  assert.equal(results[0].skipped, true);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});
