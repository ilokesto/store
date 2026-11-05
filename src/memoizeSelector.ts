import type { EqualityFn, Selector, Snapshot } from "./index.js";

/** Controls one selector's bounded, least-recently-used input cache. */
export interface MemoizeSelectorOptions<T> {
  /** Positive integer entry limit; defaults to one. */
  readonly maxSize?: number;
  /** Input equality, not output equality; defaults to Object.is. */
  readonly equalityFn?: EqualityFn<Snapshot<T>>;
}

/** A selector with an independently owned cache and explicit release operation. */
export interface MemoizedSelector<T, Selection> extends Selector<T, Selection> {
  /** Number of retained input/result pairs. */
  readonly size: number;
  /** Releases all cached input/result references. */
  clear(): void;
}

/**
 * @description Memoizes a pure selector in a per-instance bounded LRU cache.
 * Failed computations are never cached.
 * @param {Selector<T, Selection>} selector - Pure computation; failures are not cached.
 * @param {MemoizeSelectorOptions<T>} [options] - Input cache policy.
 * @param {number} [options.maxSize] - Positive safe integer entry limit; defaults to one.
 * @param {EqualityFn<Snapshot<T>>} [options.equalityFn] - Input equality; defaults to Object.is.
 * @returns {MemoizedSelector<T, Selection>} Callable selector with an owned LRU cache.
 * - size `number` - Number of retained input/result pairs.
 * - clear `() => void` - Releases cached inputs and results.
 * @example
 * const select = memoizeSelector(state => expensive(state), { maxSize: 4 });
 * select.clear();
 */
export function memoizeSelector<T, Selection>(
  selector: Selector<T, Selection>,
  options: MemoizeSelectorOptions<T> = {}
): MemoizedSelector<T, Selection> {
  const maxSize = options.maxSize ?? 1;
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) {
    throw new RangeError("maxSize must be a positive safe integer");
  }
  const equals = options.equalityFn ?? Object.is;
  const entries: Array<{ input: Snapshot<T>; result: Selection }> = [];
  const memoized = (input: Snapshot<T>): Selection => {
    const index = entries.findIndex((entry) => equals(entry.input, input));
    if (index !== -1) {
      const [entry] = entries.splice(index, 1);
      entries.unshift(entry);
      return entry.result;
    }

    const result = selector(input);
    entries.unshift({ input, result });
    if (entries.length > maxSize) {
      entries.pop();
    }
    return result;
  };
  return Object.defineProperties(memoized, {
    size: { get: () => entries.length },
    clear: { value: () => { entries.length = 0; } },
  }) as MemoizedSelector<T, Selection>;
}
