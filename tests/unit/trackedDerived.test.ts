import { describe, expect, it, vi } from "vitest";
import {
  batch,
  createStore,
  derived,
  memoizeSelector,
  trackedDerived,
  withLifecycle,
} from "../../src/index";
import type { ReadableStore } from "../../src/index";

describe("trackedDerived", () => {
  it("trackedDerived: related and unrelated writes -> only observed values recompute", () => {
    const source = createStore({ count: 1, unrelated: 0 });
    const compute = vi.fn((state: Readonly<{ count: number }>) => state.count * 2);
    const result = trackedDerived(source, compute);
    const listener = vi.fn();
    expect(compute).not.toHaveBeenCalled();
    const stop = result.subscribeSelector(value => value, listener);

    source.update(state => ({ ...state, unrelated: 1 }));
    source.update(state => ({ ...state, count: 2 }));

    expect(result.getState()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledExactlyOnceWith(4, 2);
    stop();
  });

  it("trackedDerived: changed branch -> replaces rather than accumulates dependencies", () => {
    const source = createStore({ useLeft: true, left: 1, right: 2 });
    const compute = vi.fn((state: Readonly<{ useLeft: boolean; left: number; right: number }>) =>
      state.useLeft ? state.left : state.right);
    const result = trackedDerived(source, compute);
    const observed: number[] = [];
    result.subscribe(() => observed.push(result.getState()));

    source.update(state => ({ ...state, right: 3 }));
    source.update(state => ({ ...state, useLeft: false }));
    source.update(state => ({ ...state, left: 4 }));
    source.update(state => ({ ...state, right: 5 }));

    expect(observed).toEqual([3, 5]);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: optional missing reads -> insertion and removal refresh the selection", () => {
    const source = createStore<{ label?: string; other: number }>({ other: 0 });
    const compute = vi.fn((state: Readonly<{ label?: string }>) => state.label ?? "missing");
    const result = trackedDerived(source, compute);
    const observed: string[] = [];
    result.subscribe(() => observed.push(result.getState()));

    source.set({ other: 1 });
    source.set({ label: "present", other: 1 });
    source.set({ other: 1 });

    expect(observed).toEqual(["present", "missing"]);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: in and hasOwn -> distinguish missing keys from undefined values", () => {
    const source = createStore<{ optional?: undefined }>({});
    const inherited = trackedDerived(source, state => "optional" in state);
    const own = trackedDerived(source, state => Object.hasOwn(state, "optional"));
    const values: boolean[][] = [];
    inherited.subscribeSelector(value => value, (next, before) => values.push([next, before]));
    own.subscribeSelector(value => value, (next, before) => values.push([next, before]));

    source.set({ optional: undefined });
    source.set({});

    expect(values).toEqual([[true, false], [true, false], [false, true], [false, true]]);
  });

  it("trackedDerived: Reflect.ownKeys -> observes key order and symbols but not values", () => {
    const symbol = Symbol("entry");
    const source = createStore<Record<PropertyKey, number>>({ a: 1, b: 2 });
    const compute = vi.fn((state: Readonly<Record<PropertyKey, number>>) => Reflect.ownKeys(state));
    const result = trackedDerived(source, compute);
    result.subscribe(() => undefined);
    const initial = result.getState();

    source.set({ a: 2, b: 3 });
    expect(result.getState()).toBe(initial);
    source.set({ b: 3, a: 2 });
    expect(result.getState()).toEqual(["b", "a"]);
    source.set({ b: 3, a: 2, [symbol]: 4 });

    expect(result.getState()).toEqual(["b", "a", symbol]);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: Object.keys and for-in -> refresh on key and enumerability changes", () => {
    const source = createStore<Record<string, number>>({ a: 1 });
    const keys = trackedDerived(source, state => Object.keys(state).join(","));
    const enumerated = trackedDerived(source, state => {
      const result: string[] = [];
      for (const key in state) {
        result.push(key);
      }
      return result.join(",");
    });
    keys.subscribe(() => undefined);
    enumerated.subscribe(() => undefined);
    const hidden = Object.defineProperty({ a: 1, b: 2 }, "a", { enumerable: false });

    source.set({ a: 1, b: 2 });
    expect(keys.getState()).toBe("a,b");
    expect(enumerated.getState()).toBe("a,b");
    source.set(hidden);

    expect(keys.getState()).toBe("b");
    expect(enumerated.getState()).toBe("b");
  });

  it("trackedDerived: own descriptors -> observes values and flags without a mutable baseline", () => {
    const source = createStore({ count: 1 });
    const result = trackedDerived(source, state => {
      const descriptor = Object.getOwnPropertyDescriptor(state, "count");
      const selection = [descriptor?.value, descriptor?.writable];
      if (descriptor) {
        descriptor.value = 99;
      }
      return selection;
    });
    result.subscribe(() => undefined);

    source.set({ count: 2 });
    expect(result.getState()).toEqual([2, true]);
    source.set(Object.freeze({ count: 2 }));

    expect(result.getState()).toEqual([2, false]);
  });

  it("trackedDerived: sparse arrays -> tracks index presence length and visited elements", () => {
    const source = createStore<Array<number | undefined>>([1, , 3]);
    const compute = vi.fn((state: readonly (number | undefined)[]) =>
      state.map(value => (value ?? 0) * 2).join(","));
    const result = trackedDerived(source, compute);
    const observed: string[] = [];
    result.subscribe(() => observed.push(result.getState()));

    source.set([1, , 3]);
    source.set([1, 2, 3]);
    source.set([1, 2]);

    expect(observed).toEqual(["2,4,6", "2,4"]);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: array index selection -> unrelated indices do not recompute", () => {
    const source = createStore([1, 2]);
    const compute = vi.fn((state: readonly number[]) => state[0]);
    const result = trackedDerived(source, compute);
    result.subscribe(() => undefined);

    source.set([1, 3, 4]);
    source.set([2, 3, 4]);

    expect(result.getState()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("trackedDerived: frozen nested objects -> tracks their identity without deep proxies", () => {
    const user: Readonly<{ name: string; age: number }> = Object.freeze({ name: "Ada", age: 30 });
    const source = createStore<Readonly<{ user: typeof user; other: number }>>(
      Object.freeze({ user, other: 0 })
    );
    const compute = vi.fn((state: Readonly<{ user: typeof user }>) => {
      expect(state.user).toBe(source.getState().user);
      return state.user.name;
    });
    const result = trackedDerived(source, compute);
    const listener = vi.fn();
    result.subscribe(listener);

    source.set(Object.freeze({ user, other: 1 }));
    source.set(Object.freeze({ user: Object.freeze({ ...user, age: 31 }), other: 1 }));

    expect(compute).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("trackedDerived: nested exotic values -> preserves receivers and invalidates by identity", () => {
    const map = new Map([["count", 1]]);
    const source = createStore({ map, date: new Date(0), other: 0 });
    const compute = vi.fn((state: Readonly<{ map: Map<string, number>; date: Date }>) =>
      (state.map.get("count") ?? 0) + state.date.getTime());
    const result = trackedDerived(source, compute);
    result.subscribe(() => undefined);

    source.update(state => ({ ...state, other: 1 }));
    source.update(state => ({ ...state, map: new Map([["count", 2]]) }));
    source.update(state => ({ ...state, date: new Date(3) }));

    expect(result.getState()).toBe(5);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: Date root -> changed internal slots cannot compare falsely equal", () => {
    const source = createStore(new Date(0));
    const compute = vi.fn((date: Readonly<Date>) => date.getTime());
    const result = trackedDerived(source, compute);
    result.subscribe(() => undefined);

    source.set(new Date(5));
    source.set(new Date(5));

    expect(result.getState()).toBe(5);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: Map and Set roots -> use whole-snapshot fallback with valid receivers", () => {
    const map = createStore(new Map([["count", 1]]));
    const set = createStore(new Set(["first"]));
    const selectedMap = trackedDerived(map, value => value.get("count"));
    const selectedSet = trackedDerived(set, value => value.has("second"));
    selectedMap.subscribe(() => undefined);
    selectedSet.subscribe(() => undefined);

    map.set(new Map([["count", 2]]));
    set.set(new Set(["second"]));

    expect(selectedMap.getState()).toBe(2);
    expect(selectedSet.getState()).toBe(true);
  });

  it("trackedDerived: class roots -> preserves private fields instead of proxying instances", () => {
    class Counter {
      #count: number;
      constructor(count: number) { this.#count = count; }
      get count() { return this.#count; }
    }
    const source = createStore(new Counter(1));
    const result = trackedDerived(source, state => state.count);
    result.subscribe(() => undefined);

    source.set(new Counter(2));

    expect(result.getState()).toBe(2);
  });

  it("trackedDerived: primitive nullish and object transitions -> selects current input kind", () => {
    const source = createStore<{ count: number } | number | null>(null);
    const result = trackedDerived(source, state =>
      state === null ? -1 : typeof state === "number" ? state : state.count);
    const observed: number[] = [];
    result.subscribe(() => observed.push(result.getState()));

    source.set({ count: 1 });
    source.set(2);
    source.set(null);

    expect(observed).toEqual([1, 2, -1]);
  });

  it("trackedDerived: prototype and extensibility observations -> reflect changed object shape", () => {
    const source = createStore<object>({});
    const result = trackedDerived(source, state =>
      `${Object.getPrototypeOf(state) === null}:${Object.isExtensible(state)}`);
    const observed: string[] = [];
    result.subscribe(() => observed.push(result.getState()));

    source.set(Object.create(null));
    source.set(Object.preventExtensions(Object.create(null)));

    expect(observed).toEqual(["true:true", "true:false"]);
  });

  it("trackedDerived: getters -> reads with the original receiver and compares their results", () => {
    const make = (count: number) => ({
      count,
      get doubled() { return this.count * 2; },
    });
    const source = createStore(make(1));
    const compute = vi.fn((state: Readonly<ReturnType<typeof make>>) => state.doubled);
    const result = trackedDerived(source, compute);
    result.subscribe(() => undefined);

    source.set(make(1));
    source.set(make(2));

    expect(result.getState()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("trackedDerived: direct root or nested result -> publishes raw references not proxies", () => {
    const first = { user: { name: "Ada" } };
    const source = createStore(first);
    const whole = trackedDerived(source, state => state);
    const nested = trackedDerived(source, state => state.user);
    whole.subscribe(() => undefined);
    nested.subscribe(() => undefined);
    expect(whole.getState()).toBe(first);
    expect(nested.getState()).toBe(first.user);
    const next = { user: { name: "Grace" } };

    source.set(next);

    expect(whole.getState()).toBe(next);
    expect(nested.getState()).toBe(next.user);
  });

  it("trackedDerived: escaped input and root mutation -> fail instead of changing dependencies", () => {
    const source = createStore({ count: 1 });
    let escaped: Readonly<{ count: number }> | undefined;
    const result = trackedDerived(source, state => {
      escaped = state;
      return state.count;
    });
    result.getState();
    const mutating = trackedDerived(source, state => Reflect.set(state, "count", 2));

    expect(() => escaped?.count).toThrow(TypeError);
    expect(() => mutating.getState()).toThrow(TypeError);

    expect(source.getState()).toEqual({ count: 1 });
  });

  it("trackedDerived: reconnecting a structural source -> refreshes values and owns one connection", () => {
    const source = createStore({ count: 1, other: 0 });
    const start = vi.fn();
    const cleanup = vi.fn();
    const input: ReadableStore<{ count: number; other: number }> =
      withLifecycle(source, () => { start(); return cleanup; });
    const compute = vi.fn((state: Readonly<{ count: number }>) => state.count);
    const result = trackedDerived(input, compute);
    const listener = vi.fn();
    const stop = result.subscribe(listener);
    const second = result.subscribe(listener);
    stop();
    second();

    source.set({ count: 2, other: 0 });
    expect(compute).toHaveBeenCalledTimes(1);
    const again = result.subscribe(listener);
    source.set({ count: 3, other: 0 });
    again();

    expect(result.getState()).toBe(3);
    expect(start).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("trackedDerived: initial snapshot reads -> remain separate from current cached outputs", () => {
    const source = createStore({ count: 1 });
    source.set({ count: 2 });
    const result = trackedDerived(source, state => state.count * 2);
    expect(result.getState()).toBe(4);
    expect(result.getInitialState()).toBe(2);

    source.set({ count: 3 });

    expect(result.getState()).toBe(6);
    expect(result.getInitialState()).toBe(2);
  });

  it("trackedDerived: batches and downstream derived graphs -> settle once at current values", () => {
    const source = createStore({ count: 1, other: 0 });
    const compute = vi.fn((state: Readonly<{ count: number }>) => state.count * 2);
    const tracked = trackedDerived(source, compute);
    const total = derived([source, tracked], ([state, doubled]) => state.count + doubled);
    const observed: number[] = [];
    total.subscribe(() => observed.push(total.getState()));

    batch(() => {
      source.set({ count: 2, other: 1 });
      source.set({ count: 3, other: 2 });
    });

    expect(observed).toEqual([9]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("trackedDerived: equal outputs -> advances tracked dependencies but retains output identity", () => {
    const source = createStore({ useLeft: true, left: 1, right: 3 });
    const compute = vi.fn((state: Readonly<{ useLeft: boolean; left: number; right: number }>) =>
      ({ parity: (state.useLeft ? state.left : state.right) % 2 }));
    const result = trackedDerived(source, compute, {
      equalityFn: (previous, next) => previous.parity === next.parity,
    });
    const initial = result.getState();
    const listener = vi.fn();
    result.subscribe(listener);

    source.set({ useLeft: false, left: 1, right: 3 });
    source.set({ useLeft: false, left: 2, right: 3 });
    expect(result.getState()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    source.set({ useLeft: false, left: 2, right: 4 });

    expect(result.getState()).toEqual({ parity: 0 });
    expect(compute).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("trackedDerived: failed computation -> retains delivered baseline and retries failed input", () => {
    const source = createStore({ count: 0 });
    const compute = vi.fn((state: Readonly<{ count: number }>) => {
      if (state.count === 1) { throw new Error("compute"); }
      return state.count;
    });
    const result = trackedDerived(source, compute);
    const listener = vi.fn();
    result.subscribeSelector(value => value, listener);

    expect(() => source.set({ count: 1 })).toThrow(AggregateError);
    expect(() => result.getState()).toThrow("compute");
    source.set({ count: 2 });

    expect(listener).toHaveBeenCalledExactlyOnceWith(2, 0);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it("trackedDerived: disposal during a batch -> cancels work and terminates the readable", () => {
    const source = createStore({ count: 0 });
    const cleanup = vi.fn();
    const input = withLifecycle(source, () => cleanup);
    const result = trackedDerived(input, state => state.count);
    const listener = vi.fn();
    const stop = result.subscribe(listener);

    batch(() => {
      source.set({ count: 1 });
      result.dispose();
    });

    expect(listener).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => result.getState()).toThrow();
    expect(() => result.getInitialState()).toThrow();
    expect(() => result.subscribe(listener)).toThrow();
    expect(() => result.subscribeSelector(value => value, listener)).toThrow();
    expect(() => { stop(); result.dispose(); }).not.toThrow();
  });

  it("trackedDerived: 100 unrelated writes -> fewer calculations than root identity memoization", () => {
    const source = createStore({ count: 1, other: 0 });
    const trackedCompute = vi.fn((state: Readonly<{ count: number }>) => state.count * 2);
    const memoCompute = vi.fn((state: Readonly<{ count: number }>) => state.count * 2);
    const tracked = trackedDerived(source, trackedCompute);
    const memoized = derived(source, memoizeSelector(memoCompute));
    const trackedDelivery = vi.fn();
    const memoDelivery = vi.fn();
    tracked.subscribe(trackedDelivery);
    memoized.subscribe(memoDelivery);

    for (let other = 1; other <= 100; other++) {
      source.set({ count: 1, other });
    }
    source.set({ count: 2, other: 100 });

    expect(trackedCompute).toHaveBeenCalledTimes(2);
    expect(memoCompute).toHaveBeenCalledTimes(102);
    expect(trackedDelivery).toHaveBeenCalledTimes(1);
    expect(memoDelivery).toHaveBeenCalledTimes(1);
  });

  it("trackedDerived: allocated object outputs -> avoids unrelated render invalidations", () => {
    const source = createStore({ count: 1, other: 0 });
    const compute = (state: Readonly<{ count: number }>) => ({ doubled: state.count * 2 });
    const tracked = trackedDerived(source, compute);
    const memoized = derived(source, memoizeSelector(compute));
    const trackedDelivery = vi.fn();
    const memoDelivery = vi.fn();
    tracked.subscribe(trackedDelivery);
    memoized.subscribe(memoDelivery);

    for (let other = 1; other <= 100; other++) {
      source.set({ count: 1, other });
    }
    source.set({ count: 2, other: 100 });

    expect(trackedDelivery).toHaveBeenCalledTimes(1);
    expect(memoDelivery).toHaveBeenCalledTimes(101);
    expect(tracked.getState()).toEqual({ doubled: 4 });
    expect(memoized.getState()).toEqual({ doubled: 4 });
  });
});
