import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/shared/ui/ActionMenu.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup() {
  const refs = []; let refIndex = 0, state = null, effect;
  const events = new Map(), root = {};
  class Node {}
  const document = { activeElement: null, body: root, querySelector: () => root, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const window = { innerWidth: 1000, innerHeight: 600, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const react = { useState: () => [state, value => { state = value; }], useId: () => 'menu', useRef: () => { const index = refIndex++; return refs[index] || (refs[index] = { current: null }); }, useEffect: fn => { effect = fn; } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'document', 'Node', code)(specifier => specifier === 'react' ? react : specifier === 'react-dom' ? { createPortal: element => element } : require(specifier), module, module.exports, window, document, Node);
  const choices = [], selected = [];
  const trigger = { getBoundingClientRect: () => ({ right: 980, bottom: 550, top: 520 }), focus: () => { document.activeElement = trigger; }, contains: target => target === trigger };
  for (let i = 0; i < 3; i++) choices.push({ focus: () => { document.activeElement = choices[i]; } });
  const menu = { querySelector: () => choices[0], querySelectorAll: () => choices, contains: target => choices.includes(target) };
  const items = ['编辑', '替换', '删除'].map(label => ({ label, danger: label === '删除', onSelect: () => selected.push(label) }));
  function render() {
    refIndex = 0;
    const tree = module.exports.default({ label: '资源操作', items });
    const [button, popup] = tree.props.children;
    button.props.ref.current = trigger;
    if (popup) popup.props.ref.current = menu;
    effect();
    return { button, popup };
  }
  return { render, document, choices, selected, trigger, events, window };
}
const key = name => ({ key: name, preventDefault() {}, stopPropagation() {} });

test('resource actions open above a lower screen edge and selecting is explicit', () => {
  const h = setup(); let view = h.render();
  assert.equal(view.button.props['aria-expanded'], false);
  view.button.props.onClick(); view = h.render();
  assert.equal(view.popup.props.role, 'menu');
  assert.ok(view.popup.props.style.top < 520);
  assert.ok(view.popup.props.style.left + 192 <= 1000);
  assert.deepEqual(h.selected, []);
  view.popup.props.children[2].props.onClick(); view = h.render();
  assert.deepEqual(h.selected, ['删除']); assert.equal(view.popup, null);
  assert.equal(h.document.activeElement, h.trigger);
});

test('keyboard movement, Escape and resize close the menu without executing an action', () => {
  const h = setup(); let view = h.render();
  view.button.props.onKeyDown(key('ArrowDown')); view = h.render();
  assert.equal(h.document.activeElement, h.choices[0]);
  view.popup.props.onKeyDown(key('ArrowDown')); assert.equal(h.document.activeElement, h.choices[1]);
  view.popup.props.onKeyDown(key('End')); assert.equal(h.document.activeElement, h.choices[2]);
  view.popup.props.onKeyDown(key('Escape')); view = h.render();
  assert.equal(view.popup, null); assert.deepEqual(h.selected, []);
  view.button.props.onClick(); h.render();
  h.events.get('resize')({ target: h.window }); view = h.render();
  assert.equal(view.popup, null); assert.deepEqual(h.selected, []);
});

test('resource dialogs open natively, focus the requested field, and restore the previous control', () => {
  const source = readFileSync(new URL('../src/shared/ui/PanelDialog.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  let effect, closed = 0, focused = '', requestedClose = 0;
  const document = { activeElement: { isConnected: true, focus: () => { focused = 'previous'; } }, querySelector: () => ({}) };
  const ref = { current: null };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; closed++; }, querySelector: () => ({ focus: () => { focused = 'field'; } }) };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'document', js)(specifier => specifier === 'react' ? { useEffect: fn => { effect = fn; }, useId: () => 'dialog-heading', useRef: () => ref } : specifier === 'react-dom' ? { createPortal: element => element } : require(specifier), module, module.exports, document);
  const element = module.exports.default({ title: '编辑资源', busy: true, danger: true, onClose: () => requestedClose++ });
  element.props.ref.current = dialog;
  const cleanup = effect();
  assert.ok(dialog.open); assert.equal(focused, 'field');
  assert.equal(element.props.role, 'alertdialog'); assert.equal(element.props['aria-labelledby'], 'dialog-heading');
  element.props.onCancel({ preventDefault() {} }); assert.equal(requestedClose, 0);
  cleanup(); assert.equal(closed, 1); assert.equal(focused, 'previous');
});
