// Types for spark, written by hand beside the JavaScript (there is no build
// step): what TypeScript, and editors reading JSDoc, see of src/index.js.

/** Reads a signal or computed, subscribing the running effect to it. */
export type Getter<T> = () => T;
/** Writes a signal: a new value, or a function of the old one. Returns the value. */
export type Setter<T> = (next: T | ((prev: T) => T)) => T;
/** Stops an effect, a root or a mount, running its cleanups. */
export type Dispose = () => void;

/** A value and its setter; a write that is Object.is-equal changes nothing. */
export function signal<T>(initial: T): [Getter<T>, Setter<T>];
/** A lazy, cached value derived from others, recomputed only when they change. */
export function computed<T>(fn: () => T): Getter<T>;
/** Runs fn now and whenever what it read changes; fn may return a cleanup. */
export function effect(fn: () => void | (() => void)): Dispose;
/** Groups writes: effects run once, when the outermost batch ends. */
export function batch<T>(fn: () => T): T;
/** Runs fn without subscribing to what it reads. */
export function untrack<T>(fn: () => T): T;
/** Registers a cleanup on the current effect or root. */
export function onCleanup(fn: () => void): void;
/** A detached scope owning the effects created inside it until dispose. */
export function root<T>(fn: (dispose: Dispose) => T): T;

/** What a hole between tags may hold: a function there makes it live. */
export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Child[]
  | (() => Child);

/** Real DOM from a template: an element (or text) for one root, else a fragment. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Node;
/** A keyed list for a child hole: render runs once per key, with live getters. */
export function each<T>(
  list: Getter<readonly T[]>,
  key: (item: T, index: number) => unknown,
  render: (item: Getter<T>, index: Getter<number>) => Child,
): () => Node[];
/** Appends view to container; the result removes it and disposes its effects. */
export function mount(container: Node, view: Node | (() => Node)): Dispose;
