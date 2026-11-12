import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, computed, effect, batch, untrack, root } from '../src/core.js';

test('signal get/set, updater fn, no-op on equal value', () => {
  const [a, setA] = signal(1);
  let runs = 0;
  effect(() => { a(); runs++; });
  setA(2); setA((x) => x + 1); setA(3);
  assert.equal(a(), 3);
  assert.equal(runs, 3);
});

test('computed is lazy, cached and tracks', () => {
  const [a, setA] = signal(2);
  let runs = 0;
  const dbl = computed(() => (runs++, a() * 2));
  assert.equal(runs, 0);
  assert.equal(dbl(), 4); assert.equal(dbl(), 4);
  assert.equal(runs, 1);
  setA(5);
  assert.equal(dbl(), 10);
  assert.equal(runs, 2);
});

test('effect cleanup runs before rerun and on dispose', () => {
  const [a, setA] = signal(0);
  const log = [];
  const stop = effect(() => { const v = a(); log.push('run' + v); return () => log.push('clean' + v); });
  setA(1);
  stop();
  setA(2);
  assert.deepEqual(log, ['run0', 'clean0', 'run1', 'clean1']);
});

test('diamond: d runs once per change, never sees inconsistent state', () => {
  const [a, setA] = signal(1);
  const b = computed(() => a() + 1);
  const c = computed(() => a() * 10);
  const seen = [];
  effect(() => seen.push([a(), b(), c()]));
  const d = [];
  effect(() => d.push(b() + c()));
  setA(2);
  setA(3);
  assert.deepEqual(seen, [[1, 2, 10], [2, 3, 20], [3, 4, 30]]);
  assert.deepEqual(d, [12, 23, 34]);
});

test('diamond with computed d', () => {
  const [a, setA] = signal(1);
  const b = computed(() => a() + 1), c = computed(() => a() + 2);
  let dRuns = 0;
  const d = computed(() => (dRuns++, b() + c()));
  const out = [];
  effect(() => out.push(d()));
  setA(10);
  assert.deepEqual(out, [5, 23]);
  assert.equal(dRuns, 2);
});

test('computed that yields same value does not rerun dependents', () => {
  const [a, setA] = signal(1);
  const parity = computed(() => a() % 2);
  let runs = 0;
  effect(() => { parity(); runs++; });
  setA(3); setA(5);
  assert.equal(runs, 1);
  setA(6);
  assert.equal(runs, 2);
});

test('dynamic dependencies: effect stops being triggered by unread signals', () => {
  const [flag, setFlag] = signal(true);
  const [x, setX] = signal(0);
  const [y, setY] = signal(0);
  let runs = 0;
  effect(() => { runs++; flag() ? x() : y(); });
  assert.equal(runs, 1);
  setY(1); assert.equal(runs, 1);       // y not read yet
  setX(1); assert.equal(runs, 2);
  setFlag(false); assert.equal(runs, 3);
  setX(2); assert.equal(runs, 3);       // x no longer read
  setY(2); assert.equal(runs, 4);
});

test('batch coalesces writes; reads inside see new values', () => {
  const [a, setA] = signal(1), [b, setB] = signal(1);
  const sum = computed(() => a() + b());
  const out = [];
  effect(() => out.push(sum()));
  batch(() => { setA(2); setB(3); assert.equal(sum(), 5); });
  assert.deepEqual(out, [2, 5]);
  batch(() => batch(() => { setA(0); }) || setB(0));
  assert.deepEqual(out, [2, 5, 0]);
});

test('untrack does not subscribe', () => {
  const [a, setA] = signal(0);
  let runs = 0;
  effect(() => { untrack(a); runs++; });
  setA(1);
  assert.equal(runs, 1);
});

test('nested effects are disposed when the parent reruns', () => {
  const [a, setA] = signal(0), [b, setB] = signal(0);
  const log = [];
  effect(() => {
    const v = a();
    effect(() => log.push(`inner${v}:${b()}`));
  });
  setB(1);
  setA(1);
  setB(2);
  assert.deepEqual(log, ['inner0:0', 'inner0:1', 'inner1:1', 'inner1:2']);
});

test('child effect queued with stale parent: parent runs first, child not run stale', () => {
  const [a, setA] = signal(0);
  const log = [];
  effect(() => {
    const v = a();
    effect(() => log.push(`child${v}:${a()}`));
  });
  setA(1);
  assert.deepEqual(log, ['child0:0', 'child1:1']);
});

test('root: dispose stops effects inside', () => {
  const [a, setA] = signal(0);
  let runs = 0;
  const stop = root((dispose) => { effect(() => { a(); runs++; }); return dispose; });
  setA(1); stop(); setA(2);
  assert.equal(runs, 2);
});

test('error in an effect propagates but does not break the graph', () => {
  const [a, setA] = signal(0);
  const out = [];
  effect(() => { if (a() === 1) throw new Error('boom'); });
  effect(() => out.push(a()));
  assert.throws(() => setA(1), /boom/);
  setA(2);
  assert.deepEqual(out, [0, 1, 2]);
});

test('effect writing a signal settles', () => {
  const [a, setA] = signal(1);
  const [b, setB] = signal(0);
  effect(() => setB(a() * 2));
  const out = [];
  effect(() => out.push(b()));
  setA(2);
  assert.deepEqual(out, [2, 4]);
});
