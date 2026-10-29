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
const { default: SettingsGroup } = load('features/agents/SettingsGroup');
const { default: LiveProgramEditor } = load('features/live/LiveProgramEditor');
const { hostingMode, changeHostingMode } = load('features/live/programConfig');
function program() {
  return {
    title: '已有主题', audience: '已有观众', goal: 'KEEP_GOAL', rundown: 'KEEP_RUNDOWN', segment: 'discussion',
    idle_enabled: false, idle_interval: 45, idle_max_turns: 4, idle_mode: 'memory', idle_topics: '已有话题',
    fictional_lore: 'KEEP_LORE', safety_notes: 'KEEP_RULES', blocked_terms: 'KEEP_TERMS',
    partner_enabled: true, partner_name: 'KEEP_PARTNER', partner_facts: 'KEEP_FACTS', call_to_action: 'KEEP_CTA',
    daily: { enabled: false, timezone: 'Asia/Shanghai', interval: 180, max_attempts: 200, slots: [{ start: '00:00', title: '休息', activity: 'rest', topic: '' }] },
  };
}

test('collapsed optional settings do not mount expensive editors or expose their inputs', () => {
  let mounted = 0;
  function Editor() { mounted++; return React.createElement('input', { 'aria-label': 'hidden-field' }); }
  const html = renderToStaticMarkup(React.createElement(SettingsGroup, { title: '记忆', hint: '需要时再展开' }, React.createElement(Editor)));
  assert.equal(mounted, 0); assert.match(html, /记忆/); assert.ok(!html.includes('<input'));
});

test('live settings initially show only topic, audience, references and one hosting choice', () => {
  const value = program(); let changes = 0;
  const html = renderToStaticMarkup(React.createElement(LiveProgramEditor, { agentId: 'a', value, dirty: false, liveStyle: 'KEEP_STYLE', onChange: () => changes++, onLiveStyleChange: () => changes++ }));
  assert.equal((html.match(/<textarea/g) || []).length, 3);
  assert.equal((html.match(/<select/g) || []).length, 1);
  assert.ok(!html.includes('KEEP_FACTS')); assert.ok(!html.includes('KEEP_LORE'));
  assert.ok(!html.includes('生成排练回应')); assert.equal(changes, 0);
  assert.ok(value.partner_enabled); assert.equal(value.idle_mode, 'memory');
});

test('choosing a hosting mode retains detailed schedule, limits and hidden saved values', () => {
  const original = program();
  const before = structuredClone(original);
  assert.equal(hostingMode(original), 'reply');
  const auto = changeHostingMode(original, 'auto');
  assert.equal(hostingMode(auto), 'auto'); assert.equal(auto.daily.enabled, false);
  const daily = changeHostingMode(auto, 'daily');
  assert.equal(hostingMode(daily), 'daily'); assert.equal(daily.idle_enabled, true);
  const reply = changeHostingMode(daily, 'reply');
  assert.equal(hostingMode(reply), 'reply');
  for (const state of [auto, daily, reply]) {
    const { idle_enabled, daily: { enabled, ...schedule }, ...rest } = state;
    const { idle_enabled: _, daily: { enabled: __, ...oldSchedule }, ...oldRest } = before;
    assert.deepEqual(schedule, oldSchedule); assert.deepEqual(rest, oldRest);
  }
  assert.deepEqual(original, before);
});

test('a saved daily schedule does not expand all schedule fields on first render', () => {
  const value = program(); value.daily.enabled = true;
  const html = renderToStaticMarkup(React.createElement(LiveProgramEditor, { agentId: 'a', value, dirty: false, liveStyle: '', onChange() {}, onLiveStyleChange() {} }));
  assert.match(html, /调整作息/); assert.match(html, /Asia\/Shanghai/);
  assert.ok(!html.includes('type="time"')); assert.equal((html.match(/<select/g) || []).length, 1);
});
