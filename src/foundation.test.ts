import { describe, expect, it, vi } from "vitest";
import {
  batch,
  createStore,
  derived,
  memoizeSelector,
  withLifecycle,
} from "./index";
import type { DisposableReadableStore, ReadableStore, Unsubscribe } from "./index";

describe("batch", () => {
  it("batch: nested writes -> immediate reads and one final ordinary delivery", () => {
    const left = createStore(0);
    const right = createStore(0);
    const observed: number[][] = [];
    const selections: number[][] = [];
    left.subscribe(() => observed.push([left.getState(), right.getState()]));
    right.subscribe(() => observed.push([left.getState(), right.getState()]));
    left.subscribeSelector(value => value, (next, previous) => selections.push([next, previous]));

    const result = batch(() => {
      left.set(1);
      batch(() => {
        right.set(2);
        left.set(3);
      });
      expect(left.getState()).toBe(3);
      expect(observed).toEqual([]);
      return "done";
    });

    expect(result).toBe("done");
    expect(observed).toEqual([[3, 2], [3, 2]]);
    expect(selections).toEqual([[3, 0]]);
  });

  it("batch: middleware and commit observers -> every commit remains synchronous", () => {
    const store = createStore(0);
    const records: unknown[] = [];
    const order: string[] = [];
    const replay = Symbol("replay");
    store.subscribeCommit(commit => {
      records.push(commit);
      order.push(`commit:${commit.state}`);
    });
    store.pushMiddleware((action, next) => {
      order.push("before");
      next(action);
      order.push("after");
    });
    store.subscribe(() => order.push(`notify:${store.getState()}`));

    batch(() => {
      store.set(1);
      store.replaceState(2, replay);
      store.update(value => value + 1);
    });

    expect(records).toEqual([
      { state: 1, previousState: 0, sequence: 1, source: undefined },
      { state: 2, previousState: 1, sequence: 2, source: replay },
      { state: 3, previousState: 2, sequence: 3, source: undefined },
    ]);
    expect(order).toEqual([
      "before", "commit:1", "after", "commit:2",
      "before", "commit:3", "after", "notify:3",
    ]);
  });

  it("batch: captured registrations and removal -> no retroactive or removed delivery", () => {
    const store = createStore(0);
    const first = vi.fn();
    const removed = vi.fn();
    const late = vi.fn();
    store.subscribe(first);
    const stop = store.subscribe(removed);

    batch(() => {
      store.set(1);
      stop();
      store.subscribe(late);
    });

    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(removed).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });

  it("batch: return to original value -> selectors suppress while invalidations coalesce", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const selected = vi.fn();
    store.subscribe(listener);
    store.subscribeSelector(value => value, selected);

    batch(() => {
      store.set(1);
      store.set(0);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(selected).not.toHaveBeenCalled();
    expect(store.getCommitSequence()).toBe(2);
  });

  it("batch: cross-store reentrant writes -> captured final records precede newer commits", () => {
    const left = createStore(0);
    const right = createStore(0);
    const observed: string[] = [];
    left.subscribeSelector(value => value, next => {
      observed.push(`left:${next}`);
      if (next === 1) {
        right.set(2);
        left.set(2);
      }
    });
    right.subscribeSelector(value => value, next => observed.push(`right:${next}`));

    batch(() => {
      left.set(1);
      right.set(1);
    });

    expect(observed).toEqual(["left:1", "right:1", "right:2", "left:2"]);
  });

  it("batch: batches inside delivery separated by ordinary writes -> no stale reordering", () => {
    const store = createStore(0);
    const observed: number[] = [];
    store.subscribeSelector(value => value, next => {
      if (next === 1) {
        batch(() => store.set(2));
        store.set(3);
        batch(() => store.set(4));
      }
    });
    store.subscribeSelector(value => value, next => observed.push(next));

    store.set(1);

    expect(observed).toEqual([1, 2, 3, 4]);
  });

  it("batch: reentrant new batch -> pending records from the previous batch are not overwritten", () => {
    const left = createStore(0);
    const right = createStore(0);
    const observed: string[] = [];
    left.subscribeSelector(value => value, next => {
      observed.push(`left:${next}`);
      batch(() => right.set(2));
    });
    right.subscribeSelector(value => value, next => observed.push(`right:${next}`));

    batch(() => {
      left.set(1);
      right.set(1);
    });

    expect(observed).toEqual(["left:1", "right:1", "right:2"]);
  });

  it("batch: callback and subscriber failures -> all delivery drains and the queue recovers", () => {
    const store = createStore(0);
    const callbackFailure = Symbol("callback");
    const listenerFailure = new Error("listener");
    const observed: number[] = [];
    const stop = store.subscribe(() => { throw listenerFailure; });
    store.subscribeSelector(value => value, next => observed.push(next));
    let caught: unknown;

    try {
      batch(() => {
        store.set(1);
        throw callbackFailure;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([callbackFailure, listenerFailure]);
    expect(store.getState()).toBe(1);
    stop();
    store.set(2);
    expect(observed).toEqual([1, 2]);
  });

  it("batch: callback throws undefined -> original failure survives and writes still notify", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);
    let caught = false;

    try {
      batch(() => {
        store.set(1);
        throw undefined;
      });
    } catch (error) {
      caught = true;
      expect(error).toBeUndefined();
    }

    expect(caught).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("batch: throwing commit observer -> immediate error does not discard final delivery", () => {
    const store = createStore(0);
    const failure = new Error("commit");
    const stop = store.subscribeCommit(() => { throw failure; });
    const observed: number[] = [];
    store.subscribeSelector(value => value, next => observed.push(next));

    batch(() => {
      expect(() => store.set(1)).toThrow(AggregateError);
      stop();
      store.set(2);
    });

    expect(observed).toEqual([2]);
    expect(store.getCommitSequence()).toBe(2);
  });
});

describe("derived", () => {
  it("derived: unobserved inputs -> lazy fresh reads and independently computed initial state", () => {
    const source = createStore(1);
    const compute = vi.fn((value: number) => value * 2);
    const result = derived(source, compute);
    source.set(2);

    expect(compute).not.toHaveBeenCalled();
    expect(result.getState()).toBe(4);
    expect(result.getState()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(1);
    source.set(3);
    expect(result.getState()).toBe(6);
    expect(result.getInitialState()).toBe(2);
    expect(result.getInitialState()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("derived: structural tuple inputs and batching -> one final calculation and delivery", () => {
    const price = createStore(2);
    const quantity = createStore(3);
    const structural: ReadableStore<number> = {
      getState: () => quantity.getState(),
      getInitialState: () => quantity.getInitialState(),
      subscribe: listener => quantity.subscribe(listener),
      subscribeSelector: (selector, listener, equals) =>
        quantity.subscribeSelector(selector, listener, equals),
    };
    const compute = vi.fn(([p, q]: readonly [number, number]) => p * q);
    const total = derived([price, structural] as const, compute);
    const observed: number[][] = [];
    total.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));

    batch(() => {
      price.set(4);
      price.set(5);
      quantity.set(6);
    });

    expect(total.getState()).toBe(30);
    expect(observed).toEqual([[30, 6]]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("derived: diamond and direct dependencies -> final consistent result independent of ordering", () => {
    const source = createStore(1);
    const leftCompute = vi.fn((value: number) => value + 1);
    const rightCompute = vi.fn((value: number) => value * 2);
    const left = derived(source, leftCompute);
    const right = derived(source, rightCompute);
    const compute = vi.fn(([root, a, b]: readonly [number, number, number]) => [root, a, b]);
    // Direct source first deliberately schedules the leaf before both branches.
    const leaf = derived([source, left, right] as const, compute);
    const observed: unknown[] = [];
    leaf.subscribe(() => observed.push(leaf.getState()));

    batch(() => {
      source.set(2);
      source.set(3);
    });

    expect(observed).toEqual([[3, 4, 6]]);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(leftCompute).toHaveBeenCalledTimes(2);
    expect(rightCompute).toHaveBeenCalledTimes(2);
  });

  it("derived: reads inside batch -> current values without intermediate notification", () => {
    const source = createStore(0);
    const left = derived(source, value => value + 1);
    const right = derived(source, value => value + 2);
    const leaf = derived([left, right] as const, ([a, b]) => a + b);
    const observed: number[][] = [];
    leaf.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));

    batch(() => {
      source.set(1);
      expect(leaf.getState()).toBe(5);
      expect(observed).toEqual([]);
      source.set(2);
    });

    expect(observed).toEqual([[7, 3]]);
  });

  it("derived: source listeners read before derived invalidation -> pull returns current graph", () => {
    const source = createStore(1);
    const result = derived(source, value => value * 2);
    const reads: number[] = [];
    source.subscribe(() => reads.push(result.getState()));
    const listener = vi.fn();
    result.subscribe(listener);

    source.set(2);

    expect(reads).toEqual([4]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("derived: custom equality -> stable output references and retained listener baseline", () => {
    const source = createStore(1);
    const result = derived(source, value => ({ parity: value % 2 }), {
      equalityFn: (previous, next) => previous.parity === next.parity,
    });
    const initial = result.getState();
    const listener = vi.fn();
    result.subscribeSelector(value => value, listener);

    source.set(3);

    expect(result.getState()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    source.set(4);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ parity: 0 }, initial);
  });

  it("derived: last unsubscribe and resubscription -> connections stop and values refresh", () => {
    const source = createStore(1);
    const starts = vi.fn();
    const stops = vi.fn();
    const input = withLifecycle(source, () => {
      starts();
      return stops;
    });
    const compute = vi.fn((value: number) => value * 2);
    const result = derived(input, compute);
    const listener = vi.fn();
    const first = result.subscribe(listener);
    const second = result.subscribe(listener);
    first();
    source.set(2);
    second();

    source.set(3);

    expect(starts).toHaveBeenCalledTimes(1);
    expect(stops).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(result.getState()).toBe(6);
    const again = result.subscribe(listener);
    expect(starts).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    source.set(4);
    expect(listener).toHaveBeenCalledTimes(2);
    again();
    expect(stops).toHaveBeenCalledTimes(2);
  });

  it("derived: duplicate tuple source -> one upstream connection", () => {
    const source = createStore(1);
    const subscribe = vi.spyOn(source, "subscribe");
    const result = derived([source, source] as const, ([a, b]) => a + b);

    const stop = result.subscribe(() => undefined);

    expect(subscribe).toHaveBeenCalledTimes(1);
    stop();
  });

  it("derived: source cleanup writes and disposes -> disconnect skips teardown computations", () => {
    const first = createStore(0);
    const second = createStore(0);
    const input = withLifecycle(second, () => () => {
      input.dispose();
      first.set(1);
    });
    const compute = vi.fn(([a, b]: readonly [number, number]) => a + b);
    const result = derived([first, input] as const, compute);
    const stop = result.subscribe(() => undefined);

    expect(stop).not.toThrow();

    expect(compute).toHaveBeenCalledTimes(1);
    expect(first.getState()).toBe(1);
  });

  it("derived: later source startup fails -> previously connected inputs release resources", () => {
    const first = createStore(0);
    const second = createStore(0);
    const cleanup = vi.fn();
    const input = withLifecycle(first, () => cleanup);
    const failing = withLifecycle(second, () => { throw new Error("source start"); });
    const result = derived([input, failing] as const, ([a, b]) => a + b);
    const listener = vi.fn();

    expect(() => result.subscribe(listener)).toThrow();
    first.set(1);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("derived: source cleanup fails -> every connection still disconnects", () => {
    const first = createStore(0);
    const second = createStore(0);
    const cleanup = vi.fn();
    const input = withLifecycle(first, () => cleanup);
    const failing = withLifecycle(second, () => () => { throw new Error("source cleanup"); });
    const compute = vi.fn(([a, b]: readonly [number, number]) => a + b);
    const result = derived([input, failing] as const, compute);
    const stop = result.subscribe(() => undefined);

    expect(stop).toThrow(AggregateError);
    first.set(1);
    second.set(1);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(stop).not.toThrow();
  });

  it("derived: compute failure -> sibling delivery continues and subsequent input recovers", () => {
    const source = createStore(0);
    const result = derived(source, value => {
      if (value === 1) {
        throw new Error("compute");
      }
      return value * 2;
    });
    const sibling = derived(source, value => value + 10);
    const observed: number[][] = [];
    const unaffected: number[] = [];
    result.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));
    sibling.subscribe(() => unaffected.push(sibling.getState()));

    expect(() => source.set(1)).toThrow(AggregateError);
    source.set(2);

    expect(observed).toEqual([[4, 0]]);
    expect(unaffected).toEqual([11, 12]);
  });

  it("derived: equality failure -> previous output remains the comparison baseline", () => {
    const source = createStore(0);
    const result = derived(source, value => value, {
      equalityFn: (previous, next) => {
        if (next === 1) {
          throw new Error("equality");
        }
        return Object.is(previous, next);
      },
    });
    const observed: number[][] = [];
    result.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));

    expect(() => source.set(1)).toThrow(AggregateError);
    source.set(2);

    expect(observed).toEqual([[2, 0]]);
  });

  it("derived: throwing reentrant subscriber -> FIFO results drain without recursive delivery", () => {
    const source = createStore(0);
    const result = derived(source, value => value);
    const failure = new Error("subscriber");
    const observed: number[][] = [];
    const stop = result.subscribeSelector(value => value, next => {
      if (next < 3) {
        source.set(next + 1);
      }
      throw failure;
    });
    result.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));
    let caught: unknown;

    try {
      source.set(1);
    } catch (error) {
      caught = error;
    }

    expect((caught as AggregateError).errors).toEqual([failure, failure, failure]);
    expect(observed).toEqual([[1, 0], [2, 1], [3, 2]]);
    stop();
    source.set(4);
    expect(observed.at(-1)).toEqual([4, 3]);
  });

  it("derived: last listener removed during source delivery -> pending work is canceled", () => {
    const source = createStore(0);
    const compute = vi.fn((value: number) => value + 1);
    const result = derived(source, compute);
    const listener = vi.fn();
    const stop = result.subscribe(listener);
    source.subscribe(stop);

    source.set(1);

    expect(listener).not.toHaveBeenCalled();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(result.getState()).toBe(2);
  });

  it("derived: disposal -> terminal reads, subscriptions and pending notification cancellation", () => {
    const source = createStore(0);
    const stopResource = vi.fn();
    const input = withLifecycle(source, () => stopResource);
    const result = derived(input, value => value + 1);
    const listener = vi.fn();
    const stop = result.subscribe(listener);

    batch(() => {
      source.set(1);
      result.dispose();
    });

    expect(listener).not.toHaveBeenCalled();
    expect(stopResource).toHaveBeenCalledTimes(1);
    expect(() => result.getState()).toThrow();
    expect(() => result.getInitialState()).toThrow();
    expect(() => result.subscribe(listener)).toThrow();
    expect(() => result.subscribeSelector(value => value, listener)).toThrow();
    expect(() => { result.dispose(); stop(); }).not.toThrow();
  });

  it("derived: bounded cache -> recent input tuples are reused and oldest entries are evicted", () => {
    const source = createStore(1);
    const compute = vi.fn((value: number) => value * 2);
    const result = derived(source, compute, { cacheSize: 2 });
    const stop = result.subscribe(() => undefined);

    source.set(2);
    source.set(1);
    source.set(3);
    source.set(2);

    expect(compute.mock.calls).toEqual([[1], [2], [3], [2]]);
    stop();
    result.dispose();
  });
});

describe("memoizeSelector", () => {
  it("memoizeSelector: bounded LRU and clear -> independent caches retain only recent results", () => {
    const compute = vi.fn((value: number) => ({ value }));
    const first = memoizeSelector(compute, { maxSize: 2 });
    const second = memoizeSelector(compute);
    const one = first(1);
    first(2);
    expect(first(1)).toBe(one);
    first(3);

    first(2);
    second(1);
    first.clear();

    expect(compute.mock.calls).toEqual([[1], [2], [3], [2], [1]]);
    expect(first.size).toBe(0);
    expect(second.size).toBe(1);
    expect(first(1)).not.toBe(one);
  });

  it("memoizeSelector: custom input equality and failures -> equal hits reuse and failures retry", () => {
    const failure = new Error("compute");
    const compute = vi.fn((input: Readonly<{ id: number }>) => {
      if (input.id === 2) {
        throw failure;
      }
      return { id: input.id };
    });
    const select = memoizeSelector(compute, {
      equalityFn: (previous, next) => previous.id === next.id,
    });
    const initial = select({ id: 1 });

    expect(select({ id: 1 })).toBe(initial);
    expect(() => select({ id: 2 })).toThrow(failure);
    expect(() => select({ id: 2 })).toThrow(failure);

    expect(select.size).toBe(1);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it.each([0, -1, 1.5, Infinity, NaN])(
    "memoizeSelector: invalid capacity %s -> rejects an unbounded or unusable cache",
    maxSize => {
      expect(() => memoizeSelector((value: number) => value, { maxSize })).toThrow(RangeError);
      expect(() => derived(createStore(0), value => value, { cacheSize: maxSize })).toThrow(RangeError);
    }
  );
});

describe("withLifecycle", () => {
  it("withLifecycle: duplicate listeners -> starts once and cleans up after the last owner", () => {
    const source = createStore(0);
    const cleanup = vi.fn();
    const start = vi.fn(() => cleanup);
    const live = withLifecycle(source, start);
    const listener = vi.fn();
    expect(live.getState()).toBe(0);
    expect(start).not.toHaveBeenCalled();
    const first = live.subscribe(listener);
    const second = live.subscribe(listener);

    first();
    source.set(1);
    second();
    second();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("withLifecycle: reentrant startup subscriptions -> one resource activation owns both", () => {
    const source = createStore(0);
    const cleanup = vi.fn();
    const listener = vi.fn();
    let inner: Unsubscribe | undefined;
    const start = vi.fn(() => {
      inner = live.subscribe(listener);
      return cleanup;
    });
    const live = withLifecycle(source, start);

    const outer = live.subscribe(listener);
    outer();
    source.set(1);
    inner?.();

    expect(start).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("withLifecycle: startup fails after acquisition -> owned cleanup and registrations are released", () => {
    const source = createStore(0);
    const cleanup = vi.fn();
    const listener = vi.fn();
    const failure = new Error("start");
    let fail = true;
    const live = withLifecycle(source, ({ onCleanup }) => {
      onCleanup(cleanup);
      if (fail) {
        live.subscribe(listener);
        throw failure;
      }
    });

    expect(() => live.subscribe(listener)).toThrow(failure);
    source.set(1);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    fail = false;
    const stop = live.subscribe(listener);
    source.set(2);
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("withLifecycle: disposal during startup -> returned cleanup still runs exactly once", () => {
    const source = createStore(0);
    const cleanup = vi.fn();
    const listener = vi.fn();
    let live: DisposableReadableStore<number>;
    live = withLifecycle(source, () => {
      live.dispose();
      return cleanup;
    });

    const stop = live.subscribe(listener);
    source.set(1);
    stop();

    expect(listener).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => live.getState()).toThrow();
  });

  it("withLifecycle: cleanup resubscribes -> previous resource closes before the next starts", () => {
    const source = createStore(0);
    const order: string[] = [];
    let again: Unsubscribe | undefined;
    let reconnect = true;
    const live = withLifecycle(source, ({ onCleanup }) => {
      order.push("start");
      onCleanup(() => order.push("last cleanup"));
      onCleanup(() => {
        order.push("first cleanup");
        if (reconnect) {
          reconnect = false;
          again = live.subscribe(() => undefined);
        }
      });
    });
    const stop = live.subscribe(() => undefined);

    stop();

    expect(order).toEqual(["start", "first cleanup", "last cleanup", "start"]);
    again?.();
    expect(order.slice(-2)).toEqual(["first cleanup", "last cleanup"]);
  });

  it("withLifecycle: cleanup failures -> remaining cleanup runs and later activation is usable", () => {
    const source = createStore(0);
    const order: number[] = [];
    const failure = new Error("cleanup");
    const live = withLifecycle(source, ({ onCleanup }) => {
      onCleanup(() => order.push(1));
      onCleanup(() => { throw failure; });
      onCleanup(() => order.push(2));
    });
    const stop = live.subscribe(() => undefined);

    expect(stop).toThrow(failure);

    expect(order).toEqual([2, 1]);
    expect(stop).not.toThrow();
    const again = live.subscribe(() => undefined);
    expect(again).toThrow(failure);
    expect(order).toEqual([2, 1, 2, 1]);
  });

  it("withLifecycle: selector registration failure -> no resource is acquired", () => {
    const source = createStore(0);
    const start = vi.fn();
    const live = withLifecycle(source, start);

    expect(() => live.subscribeSelector(() => {
      throw new Error("selector");
    }, () => undefined)).toThrow();

    expect(start).not.toHaveBeenCalled();
  });

  it("withLifecycle: startup write and subscriber failure -> acquired resources are cleaned", () => {
    const source = createStore(0);
    const cleanup = vi.fn();
    const listener = vi.fn(() => { throw new Error("listener"); });
    const live = withLifecycle(source, ({ onCleanup }) => {
      onCleanup(cleanup);
      source.set(1);
    });

    expect(() => live.subscribe(listener)).toThrow(AggregateError);
    source.set(2);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
