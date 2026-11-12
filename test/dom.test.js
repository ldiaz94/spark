import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './dom-shim.js';
const document = installDOM();
const { signal, computed, effect, html, each, mount, batch } = await import('../src/index.js');

let host;
beforeEach(() => { host = document.createElement('div'); });

test('static template creates real nodes', () => {
  const n = html`<p class="a">hi <b>there</b></p>`;
  assert.equal(n.tagName, 'P');
  assert.equal(n.textContent, 'hi there');
  assert.equal(n.getAttribute('class'), 'a');
});

test('text binding updates only the text node', () => {
  const [n, setN] = signal(1);
  const el = html`<p>count: ${n}</p>`;
  const p = el, text = () => p.childNodes.find((c) => c.nodeType === 3 && c.data !== 'count: ');
  assert.equal(p.textContent, 'count: 1');
  const t = text(), kids = [...p.childNodes];
  setN(2);
  assert.equal(p.textContent, 'count: 2');
  assert.equal(text(), t, 'same text node');
  assert.equal(t.writes, 1);
  assert.deepEqual([...p.childNodes], kids, 'no structural change');
});

test('static values are inserted once; nodes can be nested', () => {
  const inner = html`<i>x</i>`;
  const el = html`<p>${'a'}${inner}${[1, 2]}${null}</p>`;
  assert.equal(el.textContent, 'ax12');
  assert.equal(el.querySelector('i'), inner);
});

test('attribute binding: only changed attribute written; null removes; boolean', () => {
  const [t, setT] = signal('one');
  const [off, setOff] = signal(false);
  const el = html`<button title=${t} disabled=${off} data-x="static ${t}">go</button>`;
  assert.equal(el.getAttribute('title'), 'one');
  assert.equal(el.getAttribute('disabled'), null);
  assert.equal(el.getAttribute('data-x'), 'static one');
  setOff(true);
  assert.equal(el.getAttribute('disabled'), '');
  setT('two');
  assert.equal(el.getAttribute('title'), 'two');
  assert.equal(el.getAttribute('data-x'), 'static two');
  setOff(null);
  assert.equal(el.getAttribute('disabled'), null);
});

test('class: string / object / array; only toggled tokens change', () => {
  const [on, setOn] = signal(false);
  const el = html`<li class=${() => ['item', { done: on() }]}></li>`;
  assert.equal(el.className, 'item');
  setOn(true);
  assert.equal(el.className, 'item done');
  setOn(false);
  assert.equal(el.className, 'item');
  const el2 = html`<li class="base ${() => (on() ? 'x' : '')}"></li>`;
  assert.ok(el2.classList.contains('base'));
});

test('style: object and string', () => {
  const [w, setW] = signal(10);
  const el = html`<div style=${() => ({ width: w() + 'px', backgroundColor: 'red' })}></div>`;
  assert.equal(el.style.getPropertyValue('width'), '10px');
  assert.equal(el.style.getPropertyValue('background-color'), 'red');
  setW(20);
  assert.equal(el.style.getPropertyValue('width'), '20px');
  const el2 = html`<div style=${() => `width:${w()}px`}></div>`;
  assert.equal(el2.getAttribute('style'), 'width:20px');
});

test('@click handler runs and writes are batched', () => {
  const [a, setA] = signal(0), [b, setB] = signal(0);
  let runs = 0;
  effect(() => { a(); b(); runs++; });
  const el = html`<button @click=${() => { setA(1); setB(1); }}>x</button>`;
  assert.equal(el.getAttribute('@click'), null, 'marker attr removed');
  el.dispatchEvent({ type: 'click' });
  assert.equal(runs, 2);
});

test('property binding with .name', () => {
  const [v, setV] = signal('a');
  const el = html`<input .value=${v}>`;
  assert.equal(el.value, 'a');
  setV('b');
  assert.equal(el.value, 'b');
});

test('conditional / reactive nodes swap in place', () => {
  const [show, setShow] = signal(true);
  const el = html`<div>[${() => (show() ? html`<b>yes</b>` : 'no')}]</div>`;
  assert.equal(el.textContent, '[yes]');
  setShow(false);
  assert.equal(el.textContent, '[no]');
  setShow(true);
  assert.equal(el.textContent, '[yes]');
});

test('computed in template', () => {
  const [a, setA] = signal(1);
  const dbl = computed(() => a() * 2);
  const el = html`<p>${dbl}</p>`;
  setA(4);
  assert.equal(el.textContent, '8');
});

const items = (ids) => ids.map((id) => ({ id, label: 'item ' + id }));
const render = (get) => html`<li data-id=${() => get().id}>${() => get().label}</li>`;
const ids = (ul) => ul.querySelectorAll('li').map((l) => l.getAttribute('data-id'));

test('each: renders, reuses nodes on reorder, adds, removes', () => {
  const [list, setList] = signal(items([1, 2, 3]));
  const ul = html`<ul>${each(list, (i) => i.id, render)}</ul>`;
  assert.deepEqual(ids(ul), ['1', '2', '3']);
  const [l1, l2, l3] = ul.querySelectorAll('li');

  setList(items([3, 1, 2]));
  assert.deepEqual(ids(ul), ['3', '1', '2']);
  const after = ul.querySelectorAll('li');
  assert.deepEqual(after, [l3, l1, l2], 'same node objects, reordered');

  setList(items([3, 4, 2]));
  assert.deepEqual(ids(ul), ['3', '4', '2']);
  assert.equal(ul.querySelectorAll('li')[0], l3);
  assert.equal(ul.querySelectorAll('li')[2], l2);
  assert.equal(l1.parentNode, null, 'removed row detached');

  setList([]);
  assert.deepEqual(ids(ul), []);
});

test('each: reorder moves only what is needed', () => {
  const [list, setList] = signal(items([1, 2, 3, 4]));
  const ul = html`<ul>${each(list, (i) => i.id, render)}</ul>`;
  const lis = ul.querySelectorAll('li');
  lis.forEach((l) => (l.moves = 0));
  setList(items([1, 3, 4, 2]));
  assert.deepEqual(ids(ul), ['1', '3', '4', '2']);
  assert.deepEqual(ul.querySelectorAll('li'), [lis[0], lis[2], lis[3], lis[1]], 'same nodes');
  assert.equal(lis[0].moves, 0);
  assert.equal(lis[1].moves, 0, 'item already in place is not touched');
});

test('each: item change updates row in place without recreating it', () => {
  const [list, setList] = signal(items([1, 2]));
  const ul = html`<ul>${each(list, (i) => i.id, render)}</ul>`;
  const [a, b] = ul.querySelectorAll('li');
  setList([{ id: 1, label: 'changed' }, { id: 2, label: 'item 2' }]);
  const [a2, b2] = ul.querySelectorAll('li');
  assert.equal(a2, a); assert.equal(b2, b);
  assert.equal(a.textContent, 'changed');
});

test('each: removed row effects are disposed', () => {
  const [list, setList] = signal(items([1, 2]));
  const [tick, setTick] = signal(0);
  let renders = 0;
  const ul = html`<ul>${each(list, (i) => i.id, (get) => html`<li>${() => (renders++, tick() + get().label)}</li>`)}</ul>`;
  assert.equal(renders, 2);
  setList(items([1]));
  renders = 0;
  setTick(1);
  assert.equal(renders, 1, 'only surviving row reacts');
  assert.equal(ul.textContent, '1item 1');
});

test('each: index getter, duplicate keys throw, nested in reactive branch', () => {
  const [list, setList] = signal(items([1, 2]));
  const ul = html`<ul>${each(list, (i) => i.id, (get, idx) => html`<li>${idx}</li>`)}</ul>`;
  setList(items([2, 1]));
  assert.equal(ul.textContent, '01');
  assert.throws(() => setList(items([5, 5])), /duplicate key/);

  const [on, setOn] = signal(true);
  const [l2] = signal(items([1, 2]));
  const wrap = html`<div>${() => (on() ? html`<ul>${each(l2, (i) => i.id, render)}</ul>` : 'off')}</div>`;
  assert.equal(wrap.querySelectorAll('li').length, 2);
  setOn(false);
  assert.equal(wrap.textContent, 'off');
  setOn(true);
  assert.equal(wrap.querySelectorAll('li').length, 2);
});

test('each with fragments as rows keeps rows contiguous and ordered', () => {
  const [list, setList] = signal(items([1, 2, 3]));
  const el = html`<div>${each(list, (i) => i.id, (get) => html`<b>${() => get().id}</b><i>-</i>`)}</div>`;
  assert.equal(el.textContent, '1-2-3-');
  setList(items([3, 1, 2]));
  assert.equal(el.textContent, '3-1-2-');
  setList(items([2]));
  assert.equal(el.textContent, '2-');
});

test('mount / unmount disposes effects', () => {
  const [a, setA] = signal(1);
  let runs = 0;
  const un = mount(host, () => html`<p>${() => (runs++, a())}</p>`);
  assert.equal(host.textContent, '1');
  setA(2);
  assert.equal(host.textContent, '2');
  un();
  assert.equal(host.textContent, '');
  setA(3);
  assert.equal(runs, 2);
});

test('batch over several template bindings updates each once', () => {
  const [a, setA] = signal(1), [b, setB] = signal(1);
  let runs = 0;
  const el = html`<p>${() => (runs++, a() + b())}</p>`;
  batch(() => { setA(2); setB(2); });
  assert.equal(el.textContent, '4');
  assert.equal(runs, 2);
});
