import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/features/library/readingCommand.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const parse = exports.parseReadingCommand;
test('location commands support Chinese numbers, relative pages and restart', () => {
  assert.equal(parse('从第十页开始读').page, 10);
  assert.equal(parse('从《红楼梦》第10章开始读').chapter, 10);
  assert.equal(parse('往后翻两页').page_delta, 2);
  assert.equal(parse('上一页').page_delta, -1);
  assert.equal(parse('从头读').restart, true);
  assert.equal(parse('不要跳到第十页'), null);
});
test('explicit catalog reading commands accept book names, continuation and playback mode', () => {
  assert.equal(parse('请读红楼梦', ['红楼梦']).title, '红楼梦');
  assert.equal(parse('读《红楼梦》，读完').toEnd, true);
  assert.equal(parse('读《红楼梦》，只读一段').toEnd, false);
  assert.equal(parse('继续读书').action, 'start');
  assert.equal(parse('暂停阅读').action, 'pause');
});
test('questions, negation, quoted discussion and unrelated use never start a book', () => {
  for (const text of ['不要读《红楼梦》', '你读过《红楼梦》吗', '读《红楼梦》有什么意义？', '我喜欢读红楼梦', '这本书讲什么']) assert.equal(parse(text, ['红楼梦']), null);
});
