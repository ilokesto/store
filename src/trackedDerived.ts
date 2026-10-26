import { derived } from "./derived.js";
import type { EqualityFn, ReadableStore, Selector } from "./index.js";
import type { DisposableReadableStore } from "./withLifecycle.js";

/** Output comparison for an opt-in, shallow property-tracked derivation. */
export interface TrackedDerivedOptions<Selection> {
  /** Equal outputs retain the previous reference; defaults to Object.is. */
  readonly equalityFn?: EqualityFn<Selection>;
}

type Reads = {
  readonly prototype: object | null;
  readonly values: Map<PropertyKey, unknown>;
  readonly presence: Map<PropertyKey, boolean>;
  readonly descriptors: Map<PropertyKey, PropertyDescriptor | undefined>;
  keys?: Array<string | symbol>;
  extensible?: boolean;
};

function isTrackable(value: unknown): value is object {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null;
}

function sameDescriptor(
  previous: PropertyDescriptor | undefined,
  next: PropertyDescriptor | undefined
): boolean {
  if (previous === undefined || next === undefined) {
    return previous === next;
  }
  return previous.configurable === next.configurable &&
    previous.enumerable === next.enumerable &&
    previous.writable === next.writable &&
    Object.is(previous.value, next.value) &&
    previous.get === next.get &&
    previous.set === next.set;
}

function matches(reads: Reads, next: object): boolean {
  if (reads.prototype !== Reflect.getPrototypeOf(next)) {
    return false;
  }
  for (const [key, value] of reads.values) {
    if (!Object.is(value, Reflect.get(next, key, next))) {
      return false;
    }
  }
  for (const [key, present] of reads.presence) {
    if (present !== Reflect.has(next, key)) {
      return false;
    }
  }
  for (const [key, descriptor] of reads.descriptors) {
    if (!sameDescriptor(descriptor, Reflect.getOwnPropertyDescriptor(next, key))) {
      return false;
    }
  }
  if (reads.keys !== undefined) {
    const keys = Reflect.ownKeys(next);
    if (reads.keys.length !== keys.length ||
      reads.keys.some((key, index) => key !== keys[index])) {
      return false;
    }
  }
  return reads.extensible === undefined ||
    reads.extensible === Reflect.isExtensible(next);
}

/**
 * Derives a readable while tracking synchronous root-property observations.
 * Nested values stay raw and are compared by identity, not deeply proxied.
 * Non-plain roots use whole-snapshot identity memoization. Snapshots (including
 * nested objects and prototypes) must be immutable, and compute must be pure.
 * Do not compare the tracked root by identity or retain it beyond compute.
 * @example
 * const label = trackedDerived(store, state => state.user.name);
 * // Replacing unrelated root fields skips compute when user is unchanged.
 */
export function trackedDerived<State, Selection>(
  source: ReadableStore<State>,
  compute: Selector<State, Selection>,
  options: TrackedDerivedOptions<Selection> = {}
): DisposableReadableStore<Selection> {
  let cached: { reads: Reads; result: Selection } | undefined;
  const result = derived(source, (state) => {
    if (!isTrackable(state)) {
      const selection = compute(state);
      cached = undefined;
      return selection;
    }
    if (cached !== undefined && matches(cached.reads, state)) {
      return cached.result;
    }

    const reads: Reads = {
      prototype: Reflect.getPrototypeOf(state),
      values: new Map(),
      presence: new Map(),
      descriptors: new Map(),
    };
    const rejectMutation = () => {
      throw new TypeError("trackedDerived compute must not mutate its input");
    };
    const { proxy, revoke } = Proxy.revocable(state, {
      get(target, key) {
        // Raw nested references preserve identity and frozen-property invariants.
        const value = Reflect.get(target, key, target);
        reads.values.set(key, value);
        return value;
      },
      has(target, key) {
        const present = Reflect.has(target, key);
        reads.presence.set(key, present);
        return present;
      },
      ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        reads.keys = keys;
        return keys;
      },
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        // Callers may edit the returned descriptor; keep our baseline separate.
        reads.descriptors.set(key, descriptor && { ...descriptor });
        return descriptor;
      },
      isExtensible(target) {
        reads.extensible = Reflect.isExtensible(target);
        return reads.extensible;
      },
      set: rejectMutation,
      deleteProperty: rejectMutation,
      defineProperty: rejectMutation,
      setPrototypeOf: rejectMutation,
      preventExtensions: rejectMutation,
    });
    try {
      const selection = compute(proxy);
      if (Object.is(selection, proxy)) {
        // Returning the whole input observes its identity, not zero properties.
        cached = undefined;
        return state as Selection;
      }
      cached = { reads, result: selection };
      return selection;
    } finally {
      // Escaped reads must not silently add dependencies after cache publication.
      revoke();
    }
  }, options);
  return {
    ...result,
    dispose() {
      try {
        result.dispose();
      } finally {
        cached = undefined;
      }
    },
  };
}
