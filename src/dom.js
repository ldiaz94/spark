// spark DOM: html`` tagged templates, keyed each(), mount().
// Templates are parsed once (per call site) into a <template>, cloned per use, and only the
// "holes" get effects, so a signal change touches just the text/attribute/range that uses it.
import { effect, root, batch, untrack, signal, onCleanup } from './core.js';

const doc = () => globalThis.document;
const HOLE = /__spark_(\d+)__/;
const cache = new WeakMap();
const dash = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** html`<p class=${() => c()}>${() => n()}</p>` -> Node (one root) or DocumentFragment. */
export function html(strings, ...values) {
  let tpl = cache.get(strings);
  if (!tpl) {
    let src = '', inTag = false;
    strings.forEach((s, i) => {
      src += s;
      inTag = s.lastIndexOf('<') > s.lastIndexOf('>') ? true : s.lastIndexOf('>') > s.lastIndexOf('<') ? false : inTag;
      if (i < values.length) src += inTag ? `__spark_${i}__` : `<!--spark:${i}-->`;
    });
    tpl = doc().createElement('template');
    tpl.innerHTML = src.trim();
    cache.set(strings, tpl);
  }
  const frag = tpl.content.cloneNode(true);
  const ops = [];
  collect(frag, ops);
  for (const op of ops) op(values);
  return frag.childNodes.length === 1 ? frag.firstChild : frag;
}

function collect(node, ops) {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === 8) {
      const m = /^spark:(\d+)$/.exec(c.data);
      if (m) ops.push((v) => bindChild(c, v[m[1]]));
    } else if (c.nodeType === 1) {
      // Children first, so an element's own holes see them: a <select>'s
      // .value is set once its <option>s exist (before, browsers ignore it).
      collect(c, ops);
      for (const a of Array.from(c.attributes)) {
        const special = a.name[0] === '@' || a.name[0] === '.';
        if (special || HOLE.test(a.value)) {
          c.removeAttribute(a.name);
          ops.push((v) => bindAttr(c, a.name, a.value.split(HOLE), v));
        }
      }
    }
  }
}

// ---- attributes -------------------------------------------------------------------------

function bindAttr(el, name, parts, values) {
  // parts alternates static text and hole index: ['a ', '0', ' b', '1', '']
  const holes = parts.filter((_, i) => i % 2).map((i) => values[i]);
  if (name[0] === '@') {
    const type = name.slice(1), fn = holes[0];
    if (typeof fn !== 'function') return;
    const h = (e) => batch(() => fn.call(el, e));
    el.addEventListener(type, h);
    return onCleanup(() => el.removeEventListener(type, h));
  }
  const whole = parts.length === 3 && !parts[0] && !parts[2];
  const read = whole
    ? () => (typeof holes[0] === 'function' ? holes[0]() : holes[0])
    : () => parts.map((p, i) => (i % 2 ? (typeof values[p] === 'function' ? values[p]() : values[p]) ?? '' : p)).join('');
  const apply = setter(el, name[0] === '.' ? name.slice(1) : name, name[0] === '.');
  if (holes.some((h) => typeof h === 'function')) effect(() => apply(read()));
  else apply(read());
}

function setter(el, name, isProp) {
  let prev;
  if (isProp) return (v) => { if (el[name] !== v) el[name] = v; };
  if (name === 'class') {
    return (v) => {
      const next = new Set(tokens(v));
      for (const t of prev || []) if (!next.has(t)) el.classList.remove(t);
      for (const t of next) if (!prev || !prev.has(t)) el.classList.add(t);
      prev = next;
    };
  }
  if (name === 'style') {
    return (v) => {
      if (v && typeof v === 'object') {
        const old = typeof prev === 'object' ? prev : {};
        if (typeof prev === 'string') el.removeAttribute('style');
        for (const k in old) if (!(k in v)) el.style.setProperty(dash(k), '');
        for (const k in v) if (old[k] !== v[k]) el.style.setProperty(dash(k), v[k] == null ? '' : String(v[k]));
        prev = { ...v };
      } else if (prev !== (v = v == null || v === false ? '' : String(v))) {
        if (typeof prev === 'object') el.removeAttribute('style');
        v ? el.setAttribute('style', v) : el.removeAttribute('style');
        prev = v;
      }
    };
  }
  return (v) => {
    if (Object.is(prev, v)) return;
    prev = v;
    if (v == null || v === false) el.removeAttribute(name);
    else el.setAttribute(name, v === true ? '' : String(v));
  };
}

function tokens(v) {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\s+/).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(tokens);
  if (typeof v === 'object') return Object.keys(v).filter((k) => v[k]);
  return [];
}

// ---- children ---------------------------------------------------------------------------

// Any renderable value -> flat array of Nodes. Functions become live ranges.
function toNodes(v) {
  if (v == null || typeof v === 'boolean') return [];
  if (Array.isArray(v)) return v.flatMap(toNodes);
  if (typeof v === 'function') {
    const f = doc().createDocumentFragment();
    bindChild(f.appendChild(doc().createComment('')), v);
    return Array.from(f.childNodes);
  }
  if (typeof v === 'object' && v.nodeType) return v.nodeType === 11 ? Array.from(v.childNodes) : [v];
  return [doc().createTextNode(String(v))];
}

// Replace placeholder comment `at` by value; reactive (function) values live between markers.
function bindChild(at, v) {
  const parent = at.parentNode;
  if (typeof v !== 'function') {
    for (const n of toNodes(v)) parent.insertBefore(n, at);
    return parent.removeChild(at);
  }
  const start = doc().createComment(''), end = at;
  parent.insertBefore(start, end);
  let text = null;
  effect(() => {
    const r = v();
    let next;
    if (typeof r === 'string' || typeof r === 'number' || typeof r === 'bigint') {
      const s = String(r);
      if (text && text.parentNode && start.nextSibling === text && text.nextSibling === end) {
        if (text.data !== s) text.data = s; // same shape: touch only the text
        return;
      }
      next = [text = doc().createTextNode(s)];
    } else {
      text = null;
      next = toNodes(r);
    }
    reconcile(start, end, next);
  });
}

// Make the siblings between start and end be exactly `next`, in order, moving kept nodes.
function reconcile(start, end, next) {
  const parent = end.parentNode, keep = new Set(next);
  for (let n = start.nextSibling; n && n !== end;) {
    const after = n.nextSibling;
    if (!keep.has(n)) parent.removeChild(n);
    n = after;
  }
  let pos = start.nextSibling;
  for (const n of next) {
    if (n === pos) pos = pos.nextSibling;
    else parent.insertBefore(n, pos);
  }
}

/**
 * each(list, keyFn, render): keyed list. `list` is a getter; render(item, index) gets
 * getters (item() / index()) so a row updates in place when its item changes. Rows are
 * created once per key; reordering moves their DOM nodes. Use inside html`${each(...)}`.
 */
export function each(list, keyFn, render) {
  let rows = new Map();
  onCleanup(() => rows.forEach((r) => r.dispose()));
  const span = (r) => {
    const out = [];
    for (let n = r.first; ; n = n.nextSibling) { out.push(n); if (n === r.last) return out; }
  };
  return () => {
    const items = list() || [];
    return untrack(() => {
      const next = new Map();
      batch(() => items.forEach((item, i) => {
        const k = keyFn(item, i);
        if (next.has(k)) throw new Error(`spark each: duplicate key ${String(k)}`);
        let r = rows.get(k);
        if (r) { rows.delete(k); r.setItem(item); r.setIndex(i); }
        else r = root((dispose) => {
          const [getItem, setItem] = signal(item), [getIndex, setIndex] = signal(i);
          const f = doc().createDocumentFragment();
          const nodes = toNodes(render(getItem, getIndex));
          for (const n of nodes.length ? nodes : [doc().createComment('')]) f.appendChild(n);
          return { dispose, setItem, setIndex, first: f.firstChild, last: f.lastChild };
        });
        next.set(k, r);
      }));
      rows.forEach((r) => r.dispose()); // keys that disappeared
      rows = next;
      return [...next.values()].flatMap(span);
    });
  };
}

/** mount(container, view): append view (Node or () => Node) to container. Returns unmount. */
export function mount(container, view) {
  const a = doc().createComment(''), b = doc().createComment('');
  container.appendChild(a);
  return root((dispose) => {
    const nodes = toNodes(typeof view === 'function' ? untrack(view) : view);
    for (const n of nodes) container.appendChild(n);
    container.appendChild(b);
    return () => {
      dispose();
      for (let n = a, next; n; n = next) {
        next = n === b ? null : n.nextSibling;
        n.parentNode && n.parentNode.removeChild(n);
      }
    };
  });
}
