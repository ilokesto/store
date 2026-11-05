import { describe, expect, it, vi } from "vitest";
import { Store } from "../../src/index";
import type { SetStateAction } from "../../src/index";

describe("set middleware actions", () => {
  it.each(["set", "setState"] as const)(
    "%s: numeric replacement -> middleware transforms the original action",
    method => {
      const store = new Store(0);
      const actions: SetStateAction<number>[] = [];
      store.pushMiddleware((action, next) => {
        actions.push(action);
        next(typeof action === "number" ? action * 2 : action);
      });

      store[method](3);

      expect(actions).toEqual([3]);
      expect(store.getState()).toBe(6);
    }
  );

  it.each(["set", "setState"] as const)(
    "%s: object replacement -> middleware receives its identity and transforms it",
    method => {
      const store = new Store({ count: 0 });
      const replacement = { count: 3 };
      const actions: SetStateAction<{ count: number }>[] = [];
      store.pushMiddleware((action, next) => {
        actions.push(action);
        next(typeof action === "object" ? { count: action.count * 2 } : action);
      });

      store[method](replacement);

      expect(actions).toEqual([replacement]);
      expect(actions[0]).toBe(replacement);
      expect(store.getState()).toEqual({ count: 6 });
      expect(replacement).toEqual({ count: 3 });
    }
  );

  it.each(["set", "setState"] as const)(
    "%s: negative replacement -> discard middleware prevents commits and notifications",
    method => {
      const store = new Store(0);
      const listener = vi.fn();
      store.subscribe(listener);
      store.pushMiddleware((action, next) => {
        if (typeof action === "number" && action < 0) return;
        next(action);
      });

      store[method](-1);

      expect(store.getState()).toBe(0);
      expect(store.getCommitSequence()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    }
  );

  it.each(["set", "setState"] as const)(
    "%s: rejected object replacement -> discard middleware keeps the previous snapshot",
    method => {
      const initial = { allowed: true };
      const store = new Store(initial);
      const listener = vi.fn();
      store.subscribe(listener);
      store.pushMiddleware((action, next) => {
        if (typeof action === "object" && !action.allowed) return;
        next(action);
      });

      store[method]({ allowed: false });

      expect(store.getState()).toBe(initial);
      expect(store.getCommitSequence()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    }
  );

  it("set: callable replacement -> middleware forwards a protected literal without invoking it", () => {
    const initial = vi.fn(() => 0);
    const replacement = vi.fn(() => 1);
    const store = new Store<() => number>(initial);
    const actions: SetStateAction<() => number>[] = [];
    store.pushMiddleware((action, next) => {
      actions.push(action);
      next(action);
    });

    store.set(replacement);

    expect(actions).toHaveLength(1);
    expect(typeof actions[0]).toBe("function");
    expect(actions[0]).not.toBe(replacement);
    expect(store.getState()).toBe(replacement);
    expect(store.getInitialState()).toBe(initial);
    expect(initial).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it("set: delayed callable replacement -> commits the literal only when middleware forwards it", () => {
    const initial = vi.fn(() => 0);
    const replacement = vi.fn(() => 1);
    const store = new Store<() => number>(initial);
    const pending: Array<() => void> = [];
    store.pushMiddleware((action, next) => pending.push(() => next(action)));
    store.set(replacement);
    expect(store.getState()).toBe(initial);

    pending[0]();

    expect(store.getState()).toBe(replacement);
    expect(initial).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });
});
