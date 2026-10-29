import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}, extras = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../src/features/rag/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, URLSearchParams, AbortSignal, location: { href: 'http://localhost:5174/', origin: 'http://localhost:5174' }, require: name => name.endsWith('.css') ? {} : mocks[name] || require(name), ...extras });
  return exports;
}
test('source references render escaped metadata and no cached excerpts', () => {
  const { default: Panel } = load('SourcePanel.tsx', { './ragApi': {} });
  assert.equal(renderToStaticMarkup(React.createElement(Panel, { agentId: 'a', sources: [] })), '');
  const html = renderToStaticMarkup(React.createElement(Panel, { agentId: 'a', sources: [{ id: 'one', title: '<script>书名</script>', section: '第一百回', excerpt: '私密原文尚未请求' }] }));
  assert.match(html, /&lt;script&gt;书名/); assert.match(html, /第一百回/);
  assert.doesNotMatch(html, /私密原文尚未请求/);
});
test('local file indexing rejects external content and enforces size limit', async () => {
  const api = load('ragApi.ts', { '@/shared/api/http': { readResponse: response => response.json() } }, { fetch: async () => ({ ok: true, blob: async () => ({ size: 21 * 1024 * 1024 }) }) });
  const resource = { id: 'one', kind: 'book', name: '资料.pdf', url: 'https://other.example/book.pdf' };
  await assert.rejects(api.indexFile(resource), /本地文件/);
  await assert.rejects(api.indexFile({ ...resource, url: 'blob:http://localhost:5174/one' }), /20MB/);
  assert.equal(api.indexable({ ...resource, name: '笔记.docx' }), true);
  assert.equal(api.indexable({ ...resource, name: 'movie.mp4' }), false);
});
test('shared import queue skips already indexed documents and duplicate mounts', async () => {
  const indexed = new Set(); let uploads = 0;
  const api = load('ragApi.ts', { '@/shared/api/http': { readResponse: response => response.json() } }, { fetch: async (url, options) => {
    if (url === '/api/rag/status') return { json: async () => ({ documents: [...indexed].map(resource_id => ({ resource_id })) }) };
    if (options?.method === 'PUT') { uploads++; indexed.add('one'); return { json: async () => ({ indexed: true }) }; }
    return { ok: true, blob: async () => ({ size: 3 }) };
  } });
  const resource = { id: 'one', kind: 'book', name: '资料.txt', url: 'blob:http://localhost:5174/one' };
  await Promise.all([api.syncMissing([resource]), api.syncMissing([resource])]);
  assert.equal(uploads, 1);
});
