import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const cache = new Map();
function load(relative) {
  const candidate = resolve(root, relative);
  const path = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find(p => existsSync(p));
  assert.ok(path, `Missing module ${relative}`);
  if (path.endsWith('.css')) return {};
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(specifier => {
    if (specifier.startsWith('@/')) return load(specifier.slice(2));
    if (specifier.startsWith('.')) return load(resolve(dirname(path), specifier));
    return require(specifier);
  }, module, module.exports);
  return module.exports;
}
const { filterResourceList } = load('features/library/resourceList');
const { default: ResourcePage } = load('features/library/ResourcePage');
const resource = (id, patch = {}) => ({ id, name: id, kind: 'music', source: 'upload', description: '测试描述', ...patch });
const options = { kind: 'all', source: 'all', query: '', characterType: 'live2d', sort: 'default' };
function render(resources, extra = {}) {
  return renderToStaticMarkup(React.createElement(ResourcePage, {
    page: '资源库', resources, activeIds: [], playing: false,
    onUse() {}, onRemove: async () => true, onEdit: async () => true,
    onReplace() {}, onUpload() {}, onStudio() {}, onPause() {}, onLyrics() {}, ...extra,
  }));
}

test('search and source/type filters compose without changing original resource order', () => {
  const rows = [resource('track10', { name: '曲目10' }), resource('track2', { name: '曲目2', source: 'builtin' }), resource('book', { kind: 'book', filename: 'HongLou.TXT', description: '原文' })];
  const before = structuredClone(rows);
  assert.deepEqual(filterResourceList(rows, { ...options, source: 'builtin' }).map(r => r.id), ['track2']);
  assert.deepEqual(filterResourceList(rows, { ...options, query: ' honglou ' }).map(r => r.id), ['book']);
  assert.deepEqual(filterResourceList(rows, { ...options, sort: 'name-asc', kind: 'music' }).map(r => r.id), ['track2', 'track10']);
  assert.deepEqual(filterResourceList(rows, { ...options, sort: 'name-desc', kind: 'music' }).map(r => r.id), ['track10', 'track2']);
  assert.deepEqual(rows, before);
});

test('3D and Live2D stay separate when browsing the character category', () => {
  const rows = [resource('vrm', { kind: 'character', url: '/avatar.vrm' }), resource('2d', { kind: 'character', url: '/avatar.model3.json' })];
  assert.deepEqual(filterResourceList(rows, { ...options, kind: 'character' }).map(r => r.id), ['2d']);
  assert.deepEqual(filterResourceList(rows, { ...options, kind: 'character', characterType: '3d' }).map(r => r.id), ['vrm']);
  assert.equal(filterResourceList(rows, options).length, 2);
});

test('the resource list renders semantic columns and limits the initial page to 20 rows', () => {
  const html = render(Array.from({ length: 47 }, (_, i) => resource(`资源${i}`)));
  assert.equal((html.match(/scope="col"/g) || []).length, 5);
  assert.equal((html.match(/aria-label="更多操作：/g) || []).length, 20);
  assert.match(html, /共 47 项/); assert.match(html, /1 \/ 3/);
  assert.ok(!html.includes('资源20</h3>'));
  assert.ok(html.includes('aria-label="资源排序"'));
  assert.ok(html.includes('aria-label="每页显示数量"'));
  assert.ok(!html.includes('删除资源</span>')); // Destructive actions are not competing in every row.
});

test('row identity, license credit, playback status and primary action remain available', () => {
  const html = render([resource('song', { name: '一首歌', license: 'CC BY 4.0', author: '原作者', sourceUrl: 'https://example.com/source', duration: 123 })], { activeIds: ['song'], playing: true });
  assert.match(html, /播放中/); assert.match(html, /aria-label="暂停一首歌"/);
  assert.match(html, /CC BY 4.0/); assert.match(html, /原作者/); assert.match(html, /https:\/\/example.com\/source/);
  assert.match(html, /2:03/);
});

test('empty categories keep an import action and a valid full-width empty state', () => {
  const html = render([], { page: '书籍库' });
  assert.match(html, /colSpan="5"|colspan="5"/);
  assert.match(html, /0 项资源/); assert.match(html, /导入书籍/);
  assert.match(html, /这里还没有资源/);
});
