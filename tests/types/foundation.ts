import { expectTypeOf } from "vitest";
import { batch, createStore, derived, memoizeSelector, withLifecycle } from "../../src/index";
import type { DisposableReadableStore, ReadableStore } from "../../src/index";

const count = createStore(1);
const label = createStore({ label: "item" });
const single = derived(count, value => {
  expectTypeOf(value).toEqualTypeOf<number>();
  return `${value}`;
});
expectTypeOf(single).toEqualTypeOf<DisposableReadableStore<string>>();

const tuple = derived([count, label] as const, values => {
  expectTypeOf(values).toEqualTypeOf<readonly [number, Readonly<{ label: string }>]>();
  return `${values[1].label}:${values[0]}`;
});
expectTypeOf(tuple.getState()).toEqualTypeOf<string>();
const readable: ReadableStore<string> = tuple;
expectTypeOf(readable).toEqualTypeOf<ReadableStore<string>>();

const inlineTuple = derived([count, label], ([value, item]) => {
  expectTypeOf(value).toEqualTypeOf<number>();
  expectTypeOf(item).toEqualTypeOf<Readonly<{ label: string }>>();
  return value + item.label.length;
});
expectTypeOf(inlineTuple.getState()).toEqualTypeOf<number>();

const nullable = createStore<{ id: number } | null>(null);
const optional = createStore<string | undefined>(undefined);
const nullableTuple = derived([nullable, optional], ([item, text]) => {
  expectTypeOf(item).toEqualTypeOf<Readonly<{ id: number }> | null>();
  expectTypeOf(text).toEqualTypeOf<string | undefined>();
  return item?.id ?? text?.length ?? 0;
});
expectTypeOf(nullableTuple.getState()).toEqualTypeOf<number>();

const compare = derived(label, item => ({ length: item.label.length }), {
  equalityFn(previous, next) {
    expectTypeOf(previous).toEqualTypeOf<{ length: number }>();
    expectTypeOf(next).toEqualTypeOf<{ length: number }>();
    return previous.length === next.length;
  },
});
expectTypeOf(compare.getState()).toEqualTypeOf<Readonly<{ length: number }>>();

const select = memoizeSelector((item: Readonly<{ id: number }>) => String(item.id), {
  equalityFn: (previous, next) => previous.id === next.id,
  maxSize: 2,
});
expectTypeOf(select({ id: 1 })).toEqualTypeOf<string>();
expectTypeOf(select.size).toEqualTypeOf<number>();

const live = withLifecycle(count, ({ onCleanup }) => {
  onCleanup(() => undefined);
  return () => undefined;
});
expectTypeOf(live).toEqualTypeOf<DisposableReadableStore<number>>();
expectTypeOf(batch(() => 42 as const)).toEqualTypeOf<42>();
batch(() => count.set(2));

type AcceptsAsync = (() => Promise<number>) extends Parameters<typeof batch<Promise<number>>>[0]
  ? true
  : false;
expectTypeOf<AcceptsAsync>().toEqualTypeOf<false>();

type AcceptsMaybeAsync = (() => number | Promise<number>) extends
  Parameters<typeof batch<number | Promise<number>>>[0] ? true : false;
expectTypeOf<AcceptsMaybeAsync>().toEqualTypeOf<false>();
