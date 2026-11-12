// Minimal DOM for tests: just what spark/dom.js touches. Not a spec-compliant DOM.
class Node {
  constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; this.ops = 0; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() {
    const s = this.parentNode && this.parentNode.childNodes;
    return s ? s[s.indexOf(this) + 1] || null : null;
  }
  insertBefore(n, ref) {
    if (n.nodeType === 11) { for (const c of [...n.childNodes]) this.insertBefore(c, ref); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    if (i < 0) throw new Error('ref is not a child');
    this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    n.moves = (n.moves || 0) + 1; // how many times it was (re)inserted
    return n;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i < 0) throw new Error('not a child');
    this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  get textContent() { return this.childNodes.map((c) => (c.nodeType === 8 ? '' : c.textContent)).join(''); }
}
class Text extends Node {
  constructor(d) { super(3); this._d = d; this.writes = 0; }
  get data() { return this._d; }
  set data(v) { this._d = v; this.writes++; }
  get textContent() { return this._d; }
  cloneNode() { return new Text(this._d); }
}
class Comment extends Node {
  constructor(d) { super(8); this.data = d; }
  get textContent() { return ''; }
  cloneNode() { return new Comment(this.data); }
}
class Fragment extends Node {
  constructor() { super(11); }
  cloneNode() { const f = new Fragment(); this.childNodes.forEach((c) => f.appendChild(c.cloneNode(true))); return f; }
}
class Style {
  constructor() { this.m = new Map(); }
  setProperty(k, v) { v === '' ? this.m.delete(k) : this.m.set(k, v); }
  getPropertyValue(k) { return this.m.get(k) || ''; }
}
class Element extends Node {
  constructor(tag) {
    super(1);
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.listeners = {};
    this.style = new Style();
    this.attrWrites = 0;
    const el = this;
    this.classList = {
      add: (c) => { const s = el._classes(); s.add(c); el._setClasses(s); },
      remove: (c) => { const s = el._classes(); s.delete(c); el._setClasses(s); },
      contains: (c) => el._classes().has(c),
    };
  }
  _classes() { return new Set((this.attrs.get('class') || '').split(/\s+/).filter(Boolean)); }
  _setClasses(s) { s.size ? this.attrs.set('class', [...s].join(' ')) : this.attrs.delete('class'); }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  setAttribute(k, v) { this.attrWrites++; this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  dispatchEvent(e) { for (const f of [...(this.listeners[e.type] || [])]) f.call(this, e); }
  get className() { return this.attrs.get('class') || ''; }
  cloneNode(deep) {
    const e = new Element(this.tagName);
    for (const [k, v] of this.attrs) e.attrs.set(k, v);
    if (deep) this.childNodes.forEach((c) => e.appendChild(c.cloneNode(true)));
    return e;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [], test = sel[0] === '.' ? (e) => e.classList.contains(sel.slice(1)) : (e) => e.tagName === sel.toUpperCase();
    const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 1) { if (test(c)) out.push(c); walk(c); } });
    walk(this);
    return out;
  }
  set innerHTML(s) {
    this.childNodes.slice().forEach((c) => this.removeChild(c));
    const target = this.content || this;
    parse(s, target);
  }
}
class Template extends Element {
  constructor() { super('template'); this.content = new Fragment(); }
}

const VOID = new Set(['input', 'br', 'img', 'hr']);
function parse(src, root) {
  const re = /<!--([\s\S]*?)-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  const stack = [root];
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.appendChild(new Comment(m[1]));
    else if (m[2]) stack.pop();
    else if (m[3]) {
      const el = new Element(m[3]);
      const ar = /([^\s=>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = ar.exec(m[4]))) el.attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
      top.appendChild(el);
      if (!VOID.has(m[3].toLowerCase()) && !m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.appendChild(new Text(m[6]));
  }
}

export function installDOM() {
  const document = {
    createElement: (t) => (t === 'template' ? new Template() : new Element(t)),
    createTextNode: (d) => new Text(d),
    createComment: (d) => new Comment(d),
    createDocumentFragment: () => new Fragment(),
  };
  globalThis.document = document;
  return document;
}
