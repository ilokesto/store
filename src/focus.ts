import { derived } from "./derived.js";
import type { DerivedOptions } from "./derived.js";
import type { ReadableStore, Selector, SetStateAction, Snapshot, StoreApi } from "./index.js";
import type { DisposableReadableStore } from "./withLifecycle.js";

/** A disposable view whose writes update its parent through middleware. */
export interface WritableFocus<T> extends DisposableReadableStore<T> {
  /** Sends a replacement or updater through the parent's middleware pipeline. */
  setState(action: SetStateAction<T>): void;
  /** Writes a literal value, including function values, back to the parent. */
  set(value: T): void;
  /** Computes a new selection and immutably writes it back to the parent. */
  update(updater: (previous: T) => T): void;
}

/**
 * @description Selects a lazy view, optionally with an immutable write-back function.
 * Missing values and their creation policy belong to the supplied functions.
 * Disposing a view never disposes its parent.
 * @param {ReadableStore<State>} parent - Source of immutable snapshots and subscription ownership.
 * @param {() => Snapshot<State>} parent.getState - Reads the latest committed snapshot.
 * @param {() => Snapshot<State>} parent.getInitialState - Reads the original snapshot.
 * @param {(listener: Listener) => Unsubscribe} parent.subscribe - Registers an invalidation callback and returns its disposer.
 * @param {ReadableStore<State>["subscribeSelector"]} parent.subscribeSelector - Subscribes to selected snapshots with optional equality.
 * @param {(updater: (previousState: State) => State) => void} parent.update - Required by the writable overload to commit parent updates.
 * @param {Selector<State, Selection>} read - Pure projection of parent state.
 * @param {(state: State, value: Selection) => State} write - Immutable write-back function in the writable overload.
 * @param {DerivedOptions<Selection>} [options] - Equality and input cache policy.
 * @param {EqualityFn<Selection>} [options.equalityFn] - Output comparison; defaults to Object.is.
 * @param {number} [options.cacheSize] - Positive input-tuple cache bound; defaults to one.
 * @returns {DisposableReadableStore<Selection> | WritableFocus<Selection>} An independently disposable view with the following operations.
 * - getState `() => Snapshot<Selection>` - Reads the current selection.
 * - getInitialState `() => Snapshot<Selection>` - Reads the initial selection.
 * - subscribe `(listener: Listener) => Unsubscribe` - Subscribes without an immediate callback.
 * - subscribeSelector `ReadableStore<Selection>["subscribeSelector"]` - Subscribes to a selected value with equality filtering.
 * - dispose `() => void` - Permanently releases owned subscriptions; does not dispose sources.
 * - setState `(action: SetStateAction<Selection>) => void` - Sends a replacement or updater through the parent.
 * - set `(value: Selection) => void` - Writes a literal selection through the parent.
 * - update `(updater: (previous: Selection) => Selection) => void` - Computes a selection and writes it back immutably.
 * @example
 * const count = focus(parent, state => state.count,
 *   (state, count) => ({ ...state, count }));
 */
export function focus<State, Selection>(
  parent: NoInfer<ReadableStore<State>> & Pick<StoreApi<State>, "update">,
  read: Selector<State, Selection>,
  write: (state: State, value: Selection) => State,
  options?: DerivedOptions<Selection>
): WritableFocus<Selection>;
export function focus<State, Selection>(
  parent: ReadableStore<State>,
  read: Selector<State, Selection>,
  options?: DerivedOptions<Selection>
): DisposableReadableStore<Selection>;
export function focus<State, Selection>(
  parent: ReadableStore<State> & Partial<Pick<StoreApi<State>, "update">>,
  read: Selector<State, Selection>,
  writeOrOptions?: ((state: State, value: Selection) => State) | DerivedOptions<Selection>,
  options?: DerivedOptions<Selection>
): DisposableReadableStore<Selection> | WritableFocus<Selection> {
  if (typeof writeOrOptions !== "function") {
    return derived(parent, read, writeOrOptions);
  }
  const parentUpdate = parent.update;
  if (typeof parentUpdate !== "function") {
    throw new TypeError("Writable focus requires a writable parent");
  }
  const view = derived(parent, read, options);
  let disposed = false;
  const assertActive = () => {
    if (disposed) {
      throw new Error("Focus is disposed");
    }
  };
  const update = (updater: (previous: Selection) => Selection) => {
    assertActive();
    parentUpdate.call(parent, state => {
      assertActive();
      const previous = read(state as Snapshot<State>);
      const next = updater(previous);
      return Object.is(previous, next) ? state : writeOrOptions(state, next);
    });
  };
  return {
    ...view,
    update,
    set: value => update(() => value),
    setState: action => update(
      typeof action === "function"
        ? action as (previous: Selection) => Selection
        : () => action
    ),
    dispose() {
      disposed = true;
      view.dispose();
    },
  };
}
