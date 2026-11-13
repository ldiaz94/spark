# spark

Tiny (~400 lines), dependency-free reactive UI library. ESM, no build step, with TypeScript declarations (`src/index.d.ts`).

> **Status: experimental (0.1.0).** spark was written by
> [arno](https://github.com/ldiaz94/arno), an AI coding agent, in one
> session. Its own tests run against a small DOM shim; its first app,
> [cuento](https://github.com/ldiaz94/cuento), runs it in headless Chromium. The API may change, it is not on npm, and
> it has had no outside review. Try it, learn from it; think twice before
> shipping it.

## Security

Text holes (`${v}` between tags) become text nodes, so strings there are
never parsed as HTML. **Nothing else is sanitised.** Never bind untrusted
strings to:

- URL attributes (`href`, `src`, `action`, `formaction`): a
  `javascript:` URL runs code;
- `on*` attributes (`onclick=${s}`): the string becomes a handler. Use
  `@click=${fn}` with a function instead;
- HTML properties (`.innerHTML=${s}`, `.outerHTML`): the string is parsed
  as HTML.

The template text itself (outside the holes) is parsed as HTML once, so it
must be your own code, never built from user input.

## Use it

Copy `src/` into your project, or import a tagged version straight from
GitHub through jsDelivr:

```js
import { signal, html, mount } from 'https://cdn.jsdelivr.net/gh/ldiaz94/spark@v0.1.1/src/index.js';
```

```js
import { signal, computed, effect, batch, html, each, mount } from './src/index.js';

const [count, setCount] = signal(0);
const double = computed(() => count() * 2);

mount(document.body, html`
  <button @click=${() => setCount((n) => n + 1)}>
    clicked ${count} (x2 = ${double})
  </button>`);
```

Demo: serve the repo root (`npx serve .` or `python3 -m http.server`) and open `/demo/`.
Tests: `npm test` (`node --test`, uses a small DOM shim in `test/dom-shim.js`).

## Reactivity

| API | |
|---|---|
| `signal(v)` | `[get, set]`. `set(x)` or `set(prev => next)`. No-op if `Object.is` equal. |
| `computed(fn)` | Lazy, cached getter. Only recomputes when a dependency changed; dependents rerun only if its value changed. |
| `effect(fn)` | Runs now and when deps change. `fn` may return a cleanup (runs before rerun / on dispose). Returns `dispose`. |
| `batch(fn)` | Coalesce writes; effects run once at the end. |
| `untrack(fn)` | Read without subscribing. |
| `root(fn)` | `fn(dispose)`: detached scope owning the effects created inside. |
| `onCleanup(fn)` | Cleanup for the current effect/root. |

- **Glitch-free:** writes mark nodes dirty/check, then effects *pull* sources first. In a diamond (`a → b, a → c, b+c → d`) `d` runs once per change and never sees stale `b`/`c`.
- **Dynamic deps:** deps are re-collected on every run; an effect that stops reading a signal is no longer triggered by it.
- **Ownership:** effects created inside an effect are disposed when it reruns or is disposed.
- Writes outside a `batch` flush synchronously. Event handlers from `@event` are batched automatically.
- Errors in an effect are rethrown after the flush; the graph stays usable.

## Templates

`html` parses each template literal once, clones it per use and returns real DOM (an element, or a fragment if there are several roots). Only the holes get effects, so a change touches just its text node / attribute / range.

Pass **functions** (signal getters, computeds, arrows) for reactive holes; plain values are static.

```js
html`<p class=${() => ({ done: done() })} style=${() => ({ width: w() + 'px' })}>
  ${name} has ${() => items().length} items
</p>`
```

| Hole | Behaviour |
|---|---|
| child `${v}` | string/number → text node (updated via `.data`); Node/fragment/array/nested `html`; `null`/`false` → nothing; function → live range |
| `attr=${v}` / `attr="a ${v}"` | `setAttribute`; `null`/`false` removes; `true` → `""`. Only written when changed |
| `class=${v}` | string, array, or `{name: bool}`; only changed tokens are toggled |
| `style=${v}` | string or object (`backgroundColor` → `background-color`); only changed props are set |
| `@click=${fn}` | event listener (removed on dispose), run in a `batch` |
| `.value=${v}` | DOM property instead of attribute |

Notes: attribute names go through the HTML parser, so they are lowercase (`@dragstart`, not `@dragStart`). Don't put holes inside `<script>`/`<style>`/`<textarea>` content.

### `each(list, keyFn, render)`

```js
html`<ul>${each(todos, (t) => t.id, (todo, index) => html`<li>${() => todo().text}</li>`)}</ul>`
```

`list` is a getter. `render` is called **once per key** and receives getters `todo()` / `index()`, which update in place when the item or its position changes. Reordering moves the existing DOM nodes (nothing is recreated); removed keys have their effects disposed. Duplicate keys throw.

### `mount(container, view)`

Appends `view` (node, or function returning one) and returns an `unmount` that disposes its effects and removes its nodes.

## Layout

```
src/core.js   signals, computed, effect, batch
src/dom.js    html, each, mount
src/index.js  exports
demo/         todo app
test/         node --test suites + DOM shim
```

## Contributing

Issues are welcome; pull requests are turned off. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

ISC: see [LICENSE](LICENSE).
