# @ilokesto/store

## 2.0.0

### Major Changes

- dc598b5: Rebuild the shared state foundation with synchronous FIFO commit-snapshot
  notifications, immediate subscription disposal, independent callback registrations,
  and aggregated delivery errors. These are intentional observable changes from
  recursive, fail-fast notification delivery.

  Expose structural ReadableStore and StoreApi contracts, createStore, and explicit
  set/update operations. State now exports framework-neutral construction and
  composition from its root, createReducer handles, and bind/bindReducer entrypoints
  for React, Vue, Solid, Svelte, and Angular. Existing convenience creators share the
  same foundation, and Svelte set now stores callable values without invoking them.
  Reducer results also preserve callable value identity, and handles retain the
  capability types of an explicitly supplied Store.

  Migrate Form, Overlay, and Toast to the new Store construction surface; Modal
  inherits Overlay's updated notification foundation. Preserve framework support,
  middleware ordering, reducer metadata, SSR snapshots, and package capabilities.
  Packed Form verification inherits the root pnpm version so its local Store
  tarball override is honored in isolated consumer projects.

  See the bilingual State advanced migration guide and Store notification semantics.
  Version application and publishing are intentionally left to a later Changesets run.

### Minor Changes

- f3be972: ### Selector-aware subscriptions

  Added `store.subscribeSelector(selector, listener, equalityFn?)` for subscribing to a derived slice of state instead of the whole store. The listener receives `(nextSelection, previousSelection)` and runs only when the selected value changes.

  - `subscribeSelector` is a distinct method, not an overload of `subscribe`, so `subscribe(listener)` keeps its exact `(listener: () => void) => () => void` shape and `override subscribe(...)` continues to work in subclasses.
  - The listener is not invoked immediately on registration; it runs only when the store updates and the selected value changes.
  - Equality defaults to `Object.is`; pass a custom `equalityFn(previous, next)` to skip notifications for semantically equal selections (e.g. a user object with the same `id`).
  - Selector subscriptions are plain listeners under the hood, so they follow the same rules as `subscribe`: they run synchronously after the state is stored, do not run when `setState()` resolves to the same reference, and are removed by calling the returned unsubscribe function.
  - A selector throw at registration escapes the `subscribeSelector()` call and the listener is never added. An uncaught throw during notification propagates out of `setState()` and later listeners in that cycle are skipped.

### Patch Changes

- bb26d48: Point package repository links to the ilokesto organization monorepo and update the fetcher homepage before retiring the legacy repositories.
- c850635: Introduce Changesets for automated versioning and changelog management
