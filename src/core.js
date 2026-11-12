// spark reactive core: signals, computed, effect, batch.
// Push-pull graph: a write marks dependents DIRTY (direct) / CHECK (indirect) and queues
// effects; effects then pull, so each node recomputes at most once per flush and only
// after its sources are up to date (glitch-free).

const CLEAN = 0, CHECK = 1, DIRTY = 2, DEAD = 3;

let owner = null;     // node that adopts effects/cleanups created now
let listener = null;  // node that records reads now
let batchDepth = 0;
let flushing = false;
const queue = [];

class Node {
  constructor(fn, isEffect, adopt = true) {
    this.fn = fn;
    this.isEffect = isEffect;
    this.value = undefined;
    this.state = fn ? DIRTY : CLEAN;
    this.sources = new Set();
    this.observers = new Set();
    this.children = new Set();
    this.cleanups = [];
    this.parent = adopt ? owner : null;
    if (this.parent) this.parent.children.add(this);
  }
}

function track(n) {
  if (listener && listener.state !== DEAD) {
    listener.sources.add(n);
    n.observers.add(listener);
  }
}

function mark(n, state) {
  if (n.state >= state) return; // already as stale (or dead)
  const was = n.state;
  n.state = state;
  if (was === CLEAN) {
    if (n.isEffect) queue.push(n);
    for (const o of n.observers) mark(o, CHECK);
  }
}

// Bring n up to date: pull sources first, rerun only if one really changed.
function update(n) {
  if (n.state === DEAD) return;
  if (n.state === CHECK) {
    for (const s of [...n.sources]) {
      if (s.fn) update(s);
      if (n.state !== CHECK) break; // a source changed -> DIRTY (or n was disposed)
    }
  }
  if (n.state === DIRTY) run(n);
  if (n.state === CHECK) n.state = CLEAN;
}

function run(n) {
  cleanup(n);
  n.state = CLEAN;
  const pl = listener, po = owner;
  listener = owner = n;
  try {
    const v = n.fn(n.value);
    if (n.isEffect) {
      if (typeof v === 'function') n.cleanups.push(v);
    } else if (!Object.is(v, n.value)) {
      n.value = v;
      for (const o of n.observers) mark(o, DIRTY);
    }
  } catch (e) {
    if (!n.isEffect && n.state === CLEAN) n.state = DIRTY; // retry on next read
    throw e;
  } finally {
    listener = pl;
    owner = po;
  }
}

function cleanup(n) {
  for (const s of n.sources) s.observers.delete(n);
  n.sources.clear();
  const kids = [...n.children];
  n.children.clear();
  kids.forEach(dispose);
  const fns = n.cleanups;
  n.cleanups = [];
  const pl = listener;
  listener = null;
  try { for (let i = fns.length - 1; i >= 0; i--) fns[i](); } finally { listener = pl; }
}

function dispose(n) {
  if (n.state === DEAD) return;
  n.state = DEAD;
  if (n.parent) n.parent.children.delete(n);
  cleanup(n);
}

// A queued effect must not run before a stale ancestor (which may dispose it).
function runQueued(n) {
  if (n.parent && n.parent.state !== CLEAN) runQueued(n.parent);
  update(n);
}

function flush() {
  if (flushing) return;
  flushing = true;
  let error, failed = false, runs = 0;
  try {
    for (let i = 0; i < queue.length; i++) {
      if (++runs > 100000) throw new Error('spark: effects keep re-triggering each other');
      try { runQueued(queue[i]); } catch (e) { if (!failed) { failed = true; error = e; } }
    }
  } catch (e) {
    for (const n of queue) if (n.state !== DEAD) n.state = CLEAN;
    failed = true;
    error = e;
  } finally {
    queue.length = 0;
    flushing = false;
  }
  if (failed) throw error;
}

/** signal(v) -> [get, set]. set(x) or set(prev => next). */
export function signal(initial) {
  const n = new Node(null, false, false);
  n.value = initial;
  const get = () => { track(n); return n.value; };
  const set = (x) => {
    if (typeof x === 'function') x = x(n.value);
    if (Object.is(x, n.value)) return x;
    n.value = x;
    for (const o of n.observers) mark(o, DIRTY);
    if (!batchDepth) flush();
    return x;
  };
  return [get, set];
}

/** computed(fn) -> getter. Lazy, cached, recomputes only when a dependency changed. */
export function computed(fn) {
  const n = new Node(fn, false);
  return () => { update(n); track(n); return n.value; };
}

/** effect(fn) runs now and on dependency change. fn may return a cleanup. Returns dispose. */
export function effect(fn) {
  const n = new Node(fn, true);
  update(n);
  return () => dispose(n);
}

/** Group writes; effects run once at the end of the outermost batch. */
export function batch(fn) {
  batchDepth++;
  try { return fn(); } finally { if (--batchDepth === 0) flush(); }
}

/** Run fn without recording dependencies. */
export function untrack(fn) {
  const pl = listener;
  listener = null;
  try { return fn(); } finally { listener = pl; }
}

/** Register cleanup on the current effect/root (runs on its rerun or disposal). */
export function onCleanup(fn) {
  if (owner) owner.cleanups.push(fn);
}

/** Detached ownership scope: fn(dispose). Effects created inside live until dispose(). */
export function root(fn) {
  const n = new Node(null, false, false);
  const pl = listener, po = owner;
  listener = null;
  owner = n;
  try { return fn(() => dispose(n)); } finally { listener = pl; owner = po; }
}
