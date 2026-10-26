import type { ReadableStore } from "./index.js";

type FamilyStore = ReadableStore<NonNullable<unknown> | null | undefined>;

/** Lifecycle callbacks for entries owned by one family. */
export interface StoreFamilyOptions<Key, Instance> {
  /** Called after caching a new instance; same-key lookups reuse it. */
  readonly onCreate?: (instance: Instance, key: Key) => void;
  /** Called after removal and disposal, including when disposal throws. */
  readonly onRemove?: (instance: Instance, key: Key) => void;
}

/** A strongly retained, explicitly owned keyed store cache. */
export interface StoreFamily<Key, Instance> {
  get(key: Key): Instance;
  has(key: Key): boolean;
  readonly size: number;
  /** Releases one entry; a subsequent lookup creates a fresh instance. */
  remove(key: Key): boolean;
  /** Releases the current entries; entries created by cleanup are retained. */
  clear(): void;
  /** Terminal and idempotent; releases all entries and rejects future lookups. */
  dispose(): void;
}

/**
 * Reuses instances by Map key identity (SameValueZero, object reference identity).
 * Entries are strongly retained until explicitly removed, cleared, or disposed.
 * The family calls an instance's dispose method when releasing ownership.
 * @example
 * const counters = createStoreFamily((id: string) => createStore({ id, count: 0 }));
 * const counter = counters.get("one");
 * counters.remove("one");
 */
export function createStoreFamily<Key, Instance extends FamilyStore>(
  create: (key: Key) => Instance,
  options: StoreFamilyOptions<Key, Instance> = {}
): StoreFamily<Key, Instance> {
  const entries = new Map<Key, Instance>();
  const creating = new Set<Key>();
  let disposed = false;
  const release = (instance: Instance, key: Key) => {
    const errors: unknown[] = [];
    try {
      if ("dispose" in instance && typeof instance.dispose === "function") {
        instance.dispose();
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      options.onRemove?.(instance, key);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Store family entry cleanup failed");
    }
  };
  const clear = () => {
    const previous = [...entries];
    entries.clear();
    const errors: unknown[] = [];
    for (const [key, instance] of previous) {
      try {
        release(instance, key);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Store family cleanup failed");
    }
  };
  return {
    get(key) {
      if (disposed) {
        throw new Error("Store family is disposed");
      }
      const cached = entries.get(key);
      if (cached !== undefined) {
        return cached;
      }
      if (creating.has(key)) {
        throw new Error("Recursive store family creation");
      }
      creating.add(key);
      try {
        const instance = create(key);
        if (disposed) {
          release(instance, key);
          throw new Error("Store family is disposed");
        }
        entries.set(key, instance);
        try {
          options.onCreate?.(instance, key);
        } catch (error) {
          const errors = [error];
          if (entries.get(key) === instance) {
            entries.delete(key);
            try {
              release(instance, key);
            } catch (cleanupError) {
              errors.push(cleanupError);
            }
          }
          throw new AggregateError(errors, "Store family creation failed");
        }
        return instance;
      } finally {
        creating.delete(key);
      }
    },
    has: key => entries.has(key),
    get size() {
      return entries.size;
    },
    remove(key) {
      const instance = entries.get(key);
      if (instance === undefined) {
        return false;
      }
      entries.delete(key);
      release(instance, key);
      return true;
    },
    clear,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clear();
    },
  };
}
