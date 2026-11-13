// The type declarations, checked: npm run types (TypeScript, fetched by npx).
import { signal, computed, effect, html, each, mount, batch } from '../src/index.js';
const [n, setN] = signal(1);
const d = computed(() => n() * 2);
setN(x => x + 1);
// @ts-expect-error: a number signal takes no string
setN('x');
const stop = effect(() => { d(); return () => {}; });
const [items] = signal([{ id: 1, name: 'a' }]);
const list = each(items, it => it.id, it => html`<li>${() => it().name}</li>`);
const unmount = mount(document.body, html`<ul>${list}</ul>`);
const v: number = batch(() => 3);
stop(); unmount(); void v;
