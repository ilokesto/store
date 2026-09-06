import { describe, expect, it, vi } from "vitest";
import { Store } from "./index";

describe("ordered store transitions", () => {
  it("delivers every committed selection in order when a listener writes again", () => {
    const store = new Store(0);
    const received: number[] = [];
    store.subscribe(() => {
      if (store.getState() === 1) store.setState(2);
    });
    store.subscribeSelector((state) => state, (value) => received.push(value));

    store.setState(1);

    expect(received).toEqual([1, 2]);
    expect(store.getState()).toBe(2);
  });

  it("skips a listener removed before its turn", () => {
    const store = new Store(0);
    const later = vi.fn();
    let unsubscribe: () => void = () => undefined;
    store.subscribe(() => unsubscribe());
    unsubscribe = store.subscribe(later);

    store.setState(1);

    expect(later).not.toHaveBeenCalled();
  });

  it("owns duplicate callback registrations independently", () => {
    const store = new Store(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.subscribe(listener);
    unsubscribe();

    store.setState(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("drains queued notifications before reporting listener failures and remains usable", () => {
    const store = new Store(0);
    const failure = new Error("listener failed");
    const received: number[] = [];
    const unsubscribe = store.subscribe(() => {
      if (store.getState() === 1) store.setState(2);
      throw failure;
    });
    store.subscribeSelector((state) => state, (value) => received.push(value));

    let caught: unknown;
    try {
      store.setState(1);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    if (!(caught instanceof AggregateError)) throw new Error("Expected listener errors");
    expect(caught.errors).toEqual([failure, failure]);
    expect(received).toEqual([1, 2]);
    unsubscribe();
    store.setState(3);
    expect(received).toEqual([1, 2, 3]);
  });

  it("does not recursively grow the stack for listener-driven transitions", () => {
    const store = new Store(0);
    const received: number[] = [];
    store.subscribeSelector((state) => state, (value) => {
      if (value < 10_000) store.setState(value + 1);
    });
    store.subscribeSelector((state) => state, (value) => received.push(value));

    store.setState(1);

    expect(received).toHaveLength(10_000);
    expect(received[0]).toBe(1);
    expect(received.at(-1)).toBe(10_000);
  });

  it("captures membership at each commit without replaying older records to new subscriptions", () => {
    const store = new Store(0);
    const before: number[] = [];
    const after: number[] = [];
    store.subscribeSelector((value) => value, (value) => {
      if (value !== 1) return;
      store.subscribeSelector((next) => next, (next) => before.push(next));
      store.setState(2);
      store.subscribeSelector((next) => next, (next) => after.push(next));
    });

    store.setState(1);
    store.setState(3);

    expect(before).toEqual([2, 3]);
    expect(after).toEqual([3]);
  });

  it("preserves selector baselines across delivery failures", () => {
    const store = new Store(0);
    const received: Array<readonly [number, number]> = [];
    store.subscribeSelector(
      (value) => {
        if (value === 1) throw new Error("selection failed");
        return value;
      },
      (next, previous) => received.push([next, previous]),
    );

    expect(() => store.setState(1)).toThrow(AggregateError);
    store.setState(2);

    expect(received).toEqual([[2, 0]]);
  });

  it("routes explicit set and update through middleware and keeps invalidation callbacks argument-free", () => {
    const store = new Store(0);
    const listener = vi.fn();
    const writes: number[] = [];
    store.pushMiddleware((value, next) => {
      writes.push(store.getState());
      next(value);
    });
    store.subscribe(listener);

    store.set(4);
    store.update((value) => value + 1);

    expect(writes).toEqual([0, 4]);
    expect(store.getState()).toBe(5);
    expect(listener.mock.calls).toEqual([[], []]);
  });
});
