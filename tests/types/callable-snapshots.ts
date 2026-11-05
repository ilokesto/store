import { expectTypeOf } from "vitest";
import {
  createStore,
  derived,
  focus,
  memoizeSelector,
  trackedDerived,
  withLifecycle,
} from "../../src/index";
import type { ReadableStore } from "../../src/index";

type Callback = (value: number) => string;
const callback: Callback = value => `${value}`;
const store = createStore(callback);
const readable: ReadableStore<Callback> = store;

expectTypeOf(store.getState()).toEqualTypeOf<Callback>();
expectTypeOf(store.getState()(1)).toEqualTypeOf<string>();
expectTypeOf(store.getInitialState()(1)).toEqualTypeOf<string>();
expectTypeOf(readable.getState()(1)).toEqualTypeOf<string>();
store.subscribeSelector(fn => fn(1), (next, previous) => {
  expectTypeOf(next).toEqualTypeOf<string>();
  expectTypeOf(previous).toEqualTypeOf<string>();
});
store.subscribeCommit(commit => {
  expectTypeOf(commit.state(1)).toEqualTypeOf<string>();
  expectTypeOf(commit.previousState(1)).toEqualTypeOf<string>();
});

expectTypeOf(derived(store, fn => fn(1)).getState()).toEqualTypeOf<string>();
expectTypeOf(derived([store, createStore(1)], ([fn, value]) => fn(value)).getState())
  .toEqualTypeOf<string>();
const identity = derived(store, fn => fn);
expectTypeOf(identity.getState()(1)).toEqualTypeOf<string>();
expectTypeOf(identity.getInitialState()(1)).toEqualTypeOf<string>();
expectTypeOf(trackedDerived(store, fn => fn(1)).getState()).toEqualTypeOf<string>();

const live = withLifecycle(store, () => undefined);
expectTypeOf(live.getState()(1)).toEqualTypeOf<string>();
const view = focus(store, fn => fn);
expectTypeOf(view.getState()(1)).toEqualTypeOf<string>();
const writable = focus(createStore({ callback }), state => state.callback,
  (state, next) => ({ ...state, callback: next }));
expectTypeOf(writable.getState()(1)).toEqualTypeOf<string>();
expectTypeOf(writable.getInitialState()(1)).toEqualTypeOf<string>();

const memoized = memoizeSelector<Callback, string>(fn => fn(1), {
  equalityFn: (previous, next) => previous(1) === next(1),
});
expectTypeOf(memoized(callback)).toEqualTypeOf<string>();

const nullable = createStore<Callback | null>(null);
expectTypeOf(nullable.getState()).toEqualTypeOf<Callback | null>();
expectTypeOf(derived(nullable, fn => fn?.(1)).getState())
  .toEqualTypeOf<string | undefined>();

const generic = createStore(<Value>(value: Value): Value => value);
expectTypeOf(generic.getState()(1 as const)).toEqualTypeOf<1>();
interface Overloaded {
  (value: string): string;
  (value: number): number;
}
declare const overloaded: Overloaded;
const overloadedStore = createStore(overloaded);
expectTypeOf(overloadedStore.getState()("value")).toEqualTypeOf<string>();
expectTypeOf(overloadedStore.getState()(1)).toEqualTypeOf<number>();

expectTypeOf(createStore({ count: 1 }).getState())
  .toEqualTypeOf<Readonly<{ count: number }>>();
expectTypeOf(createStore([1, 2]).getState()).toEqualTypeOf<readonly number[]>();
expectTypeOf(createStore([1, "value"] as [number, string]).getState())
  .toEqualTypeOf<readonly [number, string]>();
expectTypeOf(createStore<{ count: number } | null>(null).getState())
  .toEqualTypeOf<Readonly<{ count: number }> | null>();
