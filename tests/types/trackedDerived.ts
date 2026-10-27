import { expectTypeOf } from "vitest";
import { createStore, derived, memoizeSelector, trackedDerived } from "../../src/index";
import type {
  DisposableReadableStore,
  ReadableStore,
  TrackedDerivedOptions,
} from "../../src/index";

const source = createStore({ count: 1, label: "item" });
const tracked = trackedDerived(source, state => {
  expectTypeOf(state).toEqualTypeOf<Readonly<{ count: number; label: string }>>();
  return state.count * 2;
});
expectTypeOf(tracked).toEqualTypeOf<DisposableReadableStore<number>>();
const structural: ReadableStore<number> = tracked;
expectTypeOf(structural.getState()).toEqualTypeOf<number>();
expectTypeOf(derived(structural, count => `${count}`).getState()).toEqualTypeOf<string>();
const identityMemoized = derived(source, memoizeSelector(state => state.count * 2));
expectTypeOf(identityMemoized.getState()).toEqualTypeOf<number>();
tracked.subscribeSelector(
  value => `${value}`,
  (next, previous) => {
    expectTypeOf(next).toEqualTypeOf<string>();
    expectTypeOf(previous).toEqualTypeOf<string>();
  }
);

const compared = trackedDerived(source, state => ({ count: state.count }), {
  equalityFn(previous, next) {
    expectTypeOf(previous).toEqualTypeOf<{ count: number }>();
    expectTypeOf(next).toEqualTypeOf<{ count: number }>();
    return previous.count === next.count;
  },
} satisfies TrackedDerivedOptions<{ count: number }>);
expectTypeOf(compared.getState()).toEqualTypeOf<Readonly<{ count: number }>>();

const optional = createStore<{ name?: string } | null>(null);
expectTypeOf(trackedDerived(optional, state => state?.name).getState())
  .toEqualTypeOf<string | undefined>();
const list = createStore<readonly number[]>([1, 2]);
expectTypeOf(trackedDerived(list, state => {
  expectTypeOf(state).toEqualTypeOf<readonly number[]>();
  return state.map(value => value * 2);
}).getState()).toEqualTypeOf<readonly number[]>();

const date = createStore(new Date(0));
expectTypeOf(trackedDerived(date, state => state.getTime()).getState())
  .toEqualTypeOf<number>();
expectTypeOf(trackedDerived(source, state => state).getState())
  .toEqualTypeOf<Readonly<{ count: number; label: string }>>();
expectTypeOf<"setState" extends keyof typeof tracked ? true : false>().toEqualTypeOf<false>();
