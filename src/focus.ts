import { derived } from "./derived.js";
import type { DerivedOptions } from "./derived.js";
import type { ReadableStore, Selector, SetStateAction, StoreApi } from "./index.js";
import type { DisposableReadableStore } from "./withLifecycle.js";

/** A disposable view whose writes update its parent through middleware. */
export interface WritableFocus<T> extends DisposableReadableStore<T> {
  setState(action: SetStateAction<T>): void;
  set(value: T): void;
  update(updater: (previous: T) => T): void;
}

/**
 * Selects a lazy view, optionally with an immutable write-back function.
 * Missing values and their creation policy belong to the supplied functions.
 * Disposing a view never disposes its parent.
 * @example
 * const count = focus(parent, state => state.count,
 *   (state, count) => ({ ...state, count }));
 */
export function focus<State, Selection>(
  parent: ReadableStore<State> & Pick<StoreApi<State>, "update">,
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
      const previous = read(state);
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
