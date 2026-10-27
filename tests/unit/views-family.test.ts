import { describe, expect, it, vi } from "vitest";
import { batch, createStore, createStoreFamily, focus, withLifecycle } from "../../src/index";
import type { Middleware, ReadableStore, StoreFamily } from "../../src/index";

describe("focus", () => {
  it("focus: nested immutable writes -> parent middleware and untouched references are preserved", () => {
    const initial = { user: { name: "Ada", age: 30 }, items: [1] };
    const parent = createStore(initial);
    const middleware = vi.fn((action, next) => next(action));
    parent.pushMiddleware(middleware);
    const name = focus(parent, state => state.user.name,
      (state, name) => ({ ...state, user: { ...state.user, name } }));

    name.update(previous => previous + " Lovelace");

    expect(parent.getState()).toEqual({ user: { name: "Ada Lovelace", age: 30 }, items: [1] });
    expect(parent.getState()).not.toBe(initial);
    expect(parent.getState().user).not.toBe(initial.user);
    expect(parent.getState().items).toBe(initial.items);
    expect(initial.user.name).toBe("Ada");
    expect(middleware).toHaveBeenCalledTimes(1);
    expect(name.getInitialState()).toBe("Ada");
    name.dispose();
  });

  it("focus: middleware delays writes -> updater uses the latest parent and selected value", () => {
    const parent = createStore({ count: 1, other: 0 });
    const pending: Array<() => void> = [];
    parent.pushMiddleware((action, next) => pending.push(() => next(action)));
    const count = focus(parent, state => state.count,
      (state, count) => ({ ...state, count }));
    count.update(previous => previous + 1);
    parent.replaceState({ count: 10, other: 2 });

    pending.shift()?.();

    expect(parent.getState()).toEqual({ count: 11, other: 2 });
    count.dispose();
  });

  it("focus: blocked middleware -> write-back and notification never run", () => {
    const parent = createStore({ count: 1 });
    const write = vi.fn((state, count: number) => ({ ...state, count }));
    parent.pushMiddleware(() => undefined);
    const count = focus(parent, state => state.count, write);
    const listener = vi.fn();
    count.subscribe(listener);

    count.set(2);

    expect(parent.getState()).toEqual({ count: 1 });
    expect(write).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    count.dispose();
  });

  it("focus: same selection and unrelated parent updates -> no write-back or delivery", () => {
    const parent = createStore({ count: 1, other: 0 });
    const write = vi.fn((state, count: number) => ({ ...state, count }));
    const count = focus(parent, state => state.count, write);
    const listener = vi.fn();
    count.subscribe(listener);

    count.set(1);
    parent.update(state => ({ ...state, other: 2 }));

    expect(write).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(parent.getCommitSequence()).toBe(1);
    count.dispose();
  });

  it("focus: function selection -> set stores literals and update transforms values", () => {
    const initial = () => 1;
    const replacement = () => 2;
    const parent = createStore({ callback: initial });
    const callback = focus(parent, state => state.callback,
      (state, callback) => ({ ...state, callback }));

    callback.set(replacement);
    callback.setState(previous => () => previous() + 1);

    expect(parent.getState().callback()).toBe(3);
    expect(callback.getInitialState()).toBe(initial);
    callback.dispose();
  });

  it("focus: optional selection -> caller explicitly creates and deletes missing values", () => {
    const parent = createStore<{ user?: { name: string } }>({});
    const name = focus(parent, state => state.user?.name,
      (_state, name) => name === undefined ? {} : { user: { name } });

    name.set("Ada");
    expect(parent.getState()).toEqual({ user: { name: "Ada" } });
    name.set(undefined);

    expect(parent.getState()).toEqual({});
    name.dispose();
  });

  it("focus: readonly parent -> exposes only disposable readable methods and output equality", () => {
    const parent = createStore({ count: 1 });
    const readable: ReadableStore<{ count: number }> = parent;
    const parity = focus(readable, state => ({ parity: state.count % 2 }), {
      equalityFn: (previous, next) => previous.parity === next.parity,
    });
    const initial = parity.getState();
    const listener = vi.fn();
    parity.subscribe(listener);

    parent.set({ count: 3 });

    expect("set" in parity).toBe(false);
    expect("update" in parity).toBe(false);
    expect("setState" in parity).toBe(false);
    expect(parity.getState()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    parity.dispose();
  });

  it("focus: reentrant writes and duplicate listeners -> FIFO baselines and independent removal", () => {
    const parent = createStore({ count: 0 });
    const count = focus(parent, state => state.count,
      (state, count) => ({ ...state, count }));
    const observed: number[][] = [];
    count.subscribeSelector(value => value, next => {
      if (next < 3) count.set(next + 1);
    });
    const listener = vi.fn();
    const first = count.subscribe(listener);
    const second = count.subscribe(listener);
    first();
    count.subscribeSelector(value => value, (next, previous) => observed.push([next, previous]));

    count.setState(previous => previous + 1);

    expect(observed).toEqual([[1, 0], [2, 1], [3, 2]]);
    expect(listener).toHaveBeenCalledTimes(3);
    second();
    count.dispose();
  });

  it("focus: disposal during batch -> pending notifications and all writes become terminal", () => {
    const parent = createStore({ count: 0 });
    const count = focus(parent, state => state.count,
      (state, count) => ({ ...state, count }));
    const listener = vi.fn();
    const stop = count.subscribe(listener);

    batch(() => {
      count.set(1);
      count.dispose();
    });

    expect(listener).not.toHaveBeenCalled();
    expect(() => count.getState()).toThrow();
    expect(() => count.subscribe(listener)).toThrow();
    expect(() => count.set(2)).toThrow();
    expect(() => count.setState(2)).toThrow();
    expect(() => count.update(value => value + 1)).toThrow();
    expect(() => { count.dispose(); stop(); }).not.toThrow();
    parent.set({ count: 3 });
    expect(parent.getState().count).toBe(3);
  });

  it("focus: queued middleware action after disposal -> parent remains unchanged", () => {
    const parent = createStore({ count: 0 });
    let queued: (() => void) | undefined;
    parent.pushMiddleware((action, next) => { queued = () => next(action); });
    const count = focus(parent, state => state.count,
      (state, count) => ({ ...state, count }));
    count.set(1);
    count.dispose();

    expect(() => queued?.()).toThrow();

    expect(parent.getState()).toEqual({ count: 0 });
  });

  it("focus: nested views -> writes traverse the root middleware once", () => {
    const parent = createStore({ user: { name: "Ada" }, other: 1 });
    const middleware = vi.fn<Middleware<{ user: { name: string }; other: number }>>(
      (action, next) => next(action)
    );
    parent.pushMiddleware(middleware);
    const user = focus(parent, state => state.user, (state, user) => ({ ...state, user }));
    const name = focus(user, state => state.name, (state, name) => ({ ...state, name }));

    name.set("Grace");

    expect(parent.getState()).toEqual({ user: { name: "Grace" }, other: 1 });
    expect(middleware).toHaveBeenCalledTimes(1);
    name.dispose();
    expect(user.getState()).toEqual({ name: "Grace" });
    user.dispose();
  });
});

describe("createStoreFamily", () => {
  it("createStoreFamily: primitive and object keys -> caches by SameValueZero and reference identity", () => {
    const create = vi.fn((key: unknown) => createStore(key));
    const family = createStoreFamily(create);
    const object = { id: 1 };

    expect(family.get(object)).toBe(family.get(object));
    expect(family.get({ id: 1 })).not.toBe(family.get(object));
    expect(family.get(NaN)).toBe(family.get(NaN));
    expect(family.get(-0)).toBe(family.get(0));

    expect(family.size).toBe(4);
    expect(create).toHaveBeenCalledTimes(4);
    family.dispose();
  });

  it("createStoreFamily: remove and clear -> callbacks run once and lookups create fresh instances", () => {
    const events: string[] = [];
    const family = createStoreFamily((key: string) => createStore(key), {
      onCreate: (_instance, key) => events.push(`create:${key}`),
      onRemove: (_instance, key) => events.push(`remove:${key}`),
    });
    const first = family.get("one");
    family.get("two");

    expect(family.remove("one")).toBe(true);
    expect(family.remove("one")).toBe(false);
    expect(family.get("one")).not.toBe(first);
    family.clear();
    family.clear();

    expect(events).toEqual(["create:one", "create:two", "remove:one", "create:one", "remove:two", "remove:one"]);
    expect(family.size).toBe(0);
    expect(family.has("one")).toBe(false);
    family.dispose();
  });

  it("createStoreFamily: active focused entries removed in batch -> resources and pending deliveries release", () => {
    const parent = createStore({ count: 0 });
    const cleanup = vi.fn();
    const input = withLifecycle(parent, () => cleanup);
    const family = createStoreFamily((_key: string) => focus(input, state => state.count));
    const instance = family.get("one");
    const listener = vi.fn();
    const stop = instance.subscribe(listener);

    batch(() => {
      parent.set({ count: 1 });
      family.remove("one");
    });

    expect(listener).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => instance.getState()).toThrow();
    expect(() => stop()).not.toThrow();
    expect(parent.getState()).toEqual({ count: 1 });
    family.dispose();
    input.dispose();
  });

  it("createStoreFamily: disposal fails -> all entries and removal callbacks still release", () => {
    const cleanup = vi.fn();
    const removed = vi.fn();
    const family = createStoreFamily((key: string) => ({
      ...withLifecycle(createStore(key), () => undefined),
      dispose() {
        cleanup(key);
        throw new Error(key);
      },
    }), { onRemove: removed });
    family.get("one");
    family.get("two");

    expect(() => family.dispose()).toThrow(AggregateError);

    expect(cleanup.mock.calls).toEqual([["one"], ["two"]]);
    expect(removed).toHaveBeenCalledTimes(2);
    expect(family.size).toBe(0);
    expect(() => family.get("three")).toThrow();
    expect(() => { family.dispose(); family.clear(); }).not.toThrow();
  });

  it("createStoreFamily: onCreate fails -> new instance is removed and disposed before retry", () => {
    const cleanup = vi.fn();
    const removed = vi.fn();
    let fail = true;
    const family = createStoreFamily((key: string) => ({
      ...withLifecycle(createStore(key), () => undefined),
      dispose: cleanup,
    }), {
      onCreate: () => { if (fail) throw new Error("creation"); },
      onRemove: removed,
    });

    expect(() => family.get("one")).toThrow(AggregateError);

    expect(family.size).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
    fail = false;
    expect(family.get("one").getState()).toBe("one");
    family.dispose();
  });

  it("createStoreFamily: reentrant callback lookup -> cached entry is visible before onCreate", () => {
    const observed: unknown[] = [];
    const family: StoreFamily<string, ReturnType<typeof createStore<string>>> =
      createStoreFamily((key: string) => createStore(key), {
        onCreate: (instance, key) => observed.push(family.get(key) === instance),
      });

    family.get("one");

    expect(observed).toEqual([true]);
    family.dispose();
  });

  it("createStoreFamily: clear cleanup recreates key -> new ownership survives the snapshot clear", () => {
    let recreate = true;
    const family: StoreFamily<string, ReturnType<typeof createStore<string>>> =
      createStoreFamily((key: string) => createStore(key), {
        onRemove: (_instance, key) => {
          if (recreate) {
            recreate = false;
            family.get(key);
          }
        },
      });
    const previous = family.get("one");

    family.clear();

    expect(family.size).toBe(1);
    expect(family.get("one")).not.toBe(previous);
    family.dispose();
  });

  it("createStoreFamily: recursive factory and factory failure -> no partial entries and retry works", () => {
    let recurse = true;
    const family: StoreFamily<string, ReturnType<typeof createStore<string>>> =
      createStoreFamily((key: string) => recurse ? family.get(key) : createStore(key));

    expect(() => family.get("one")).toThrow("Recursive");

    expect(family.size).toBe(0);
    recurse = false;
    expect(family.get("one").getState()).toBe("one");
    family.dispose();
  });

  it("createStoreFamily: factory disposes its family -> newly returned instance is still released", () => {
    const cleanup = vi.fn();
    const family: StoreFamily<string, ReadableStore<string> & { dispose(): void }> =
      createStoreFamily((key: string) => {
        family.dispose();
        return { ...withLifecycle(createStore(key), () => undefined), dispose: cleanup };
      });

    expect(() => family.get("one")).toThrow("disposed");

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(family.size).toBe(0);
    expect(() => family.get("one")).toThrow();
  });
});
