import { cancelComputation, scheduleComputation } from "./batch.js";
import { Store } from "./index.js";
import type { EqualityFn, ReadableStore, Unsubscribe } from "./index.js";
import { memoizeSelector } from "./memoizeSelector.js";
import { withLifecycle } from "./withLifecycle.js";
import type { DisposableReadableStore } from "./withLifecycle.js";

// Readonly<unknown> does not retain nullish snapshots in a mapped-type bound.
type DerivedSource = ReadableStore<NonNullable<unknown> | null | undefined>;

/** Snapshot values inferred from a readonly tuple of structural readables. */
export type SourceValues<Sources extends readonly DerivedSource[]> = {
  readonly [Index in keyof Sources]: Sources[Index] extends ReadableStore<infer State>
    ? Readonly<State>
    : never;
};

/** Equality and bounded input memoization for one derived instance. */
export interface DerivedOptions<Selection> {
  /** Output equality; equal results retain the previous output reference. */
  readonly equalityFn?: EqualityFn<Selection>;
  /** Positive integer LRU input-tuple limit; defaults to one. */
  readonly cacheSize?: number;
}

/**
 * Lazily computes a readable from one source or a readonly tuple of sources.
 * Source subscriptions exist only while the result has subscribers. Computation
 * must be pure; values are shallow readonly snapshots, not runtime clones.
 * @example
 * const total = derived([price, quantity] as const, ([p, q]) => p * q);
 */
export function derived<State, Selection>(
  source: ReadableStore<State>,
  compute: (state: Readonly<State>) => Selection,
  options?: DerivedOptions<Selection>
): DisposableReadableStore<Selection>;
export function derived<
  const Sources extends readonly DerivedSource[],
  Selection
>(
  sources: Sources,
  compute: (states: SourceValues<Sources>) => Selection,
  options?: DerivedOptions<Selection>
): DisposableReadableStore<Selection>;
export function derived<Selection>(
  sources: DerivedSource | readonly DerivedSource[],
  compute: (states: never) => Selection,
  options: DerivedOptions<Selection> = {}
): DisposableReadableStore<Selection> {
  const multiple = Array.isArray(sources);
  const inputs: readonly DerivedSource[] = multiple
    ? [...sources]
    : [sources as DerivedSource];
  const evaluate = (states: readonly unknown[]) =>
    compute((multiple ? states : states[0]) as never);
  const memoized = memoizeSelector(evaluate, {
    maxSize: options.cacheSize,
    equalityFn: (previous, next) =>
      previous.length === next.length &&
      previous.every((state, index) => Object.is(state, next[index])),
  });
  const equals = options.equalityFn ?? Object.is;
  let current: { value: Selection } | undefined;
  let initial: { value: Selection } | undefined;
  let connected = false;
  let output: Store<Selection> | undefined;

  const getState = () => {
    const next = memoized(inputs.map((input) => input.getState()));
    if (current === undefined || !equals(current.value, next)) {
      current = { value: next };
    }
    return current.value;
  };
  const getOutput = () => {
    if (output === undefined) {
      output = new Store(getState());
    } else if (!connected) {
      output.replaceState(getState());
    }
    return output;
  };
  const publish = () => {
    if (connected) {
      const next = getState();
      output?.replaceState(next);
    }
  };
  const invalidate = () => {
    if (connected) {
      scheduleComputation(publish);
    }
  };
  const readable: ReadableStore<Selection> = {
    getState,
    getInitialState() {
      if (initial === undefined) {
        initial = { value: evaluate(inputs.map((input) => input.getInitialState())) };
      }
      return initial.value;
    },
    subscribe: (listener) => getOutput().subscribe(listener),
    subscribeSelector(selector, listener, equalityFn = Object.is) {
      let previous = selector(getState());
      return getOutput().subscribeSelector(
        (state) => state,
        (state) => {
          const next = selector(state);
          if (equalityFn(previous, next)) {
            return;
          }
          const before = previous;
          previous = next;
          listener(next, before);
        },
        () => false
      );
    },
  };
  const owned = withLifecycle(readable, ({ onCleanup }) => {
    const stops: Unsubscribe[] = [];
    connected = true;
    onCleanup(() => {
      connected = false;
      cancelComputation(publish);
      const errors: unknown[] = [];
      // Teardown can write to another input or dispose it. Disable publication
      // before any source-owned cleanup runs, and still release every connection.
      for (const stop of stops.reverse()) {
        try {
          stop();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Derived source cleanup failed");
      }
    });
    for (const input of new Set(inputs)) {
      stops.push(input.subscribe(invalidate));
    }
    invalidate();
  });
  return {
    ...owned,
    dispose() {
      try {
        owned.dispose();
      } finally {
        memoized.clear();
        output = undefined;
        current = undefined;
        initial = undefined;
      }
    },
  };
}
