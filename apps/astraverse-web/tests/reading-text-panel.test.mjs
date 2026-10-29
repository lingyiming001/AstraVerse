import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url), exports = {};
let readers = {};
const source = await readFile(new URL('../src/features/library/ReadingTextPanel.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: path => path.endsWith('.css') ? {} : path === './bookReading' ? { useBookReading: selector => selector({ readers }) } : require(path) });
const render = (agentId, visible) => renderToStaticMarkup(React.createElement(exports.default, { agentId, visible, onToggle() {} }));
test('hidden text is not rendered; expanding renders real source as escaped text', () => {
  readers = { a: { reading: { title: '红楼梦', active: true, percent: 12, chapter: '第一回' }, text: '<script>真实正文</script>' } };
  const hidden = render('a', false);
  assert.match(hidden, /显示原文/); assert.match(hidden, /aria-expanded="false"/);
  assert.doesNotMatch(hidden, /真实正文/);
  const expanded = render('a', true);
  assert.match(expanded, /隐藏原文/); assert.match(expanded, /第一回/);
  assert.match(expanded, /&lt;script&gt;真实正文&lt;\/script&gt;/);
  assert.match(expanded, /role="region"/);
});
test('a different actor never receives the previous actor reading text', () => {
  assert.equal(render('b', true), '');
});
