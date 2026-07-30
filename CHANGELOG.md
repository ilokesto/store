# @ilokesto/store

## 1.2.0

### Minor Changes

- 1299871: Add a new `subscribeSelector(selector, listener, equalityFn?)` method that subscribes to a derived slice of state. It returns an unsubscribe function, does not invoke the listener immediately, calls it with `(nextSelection, previousSelection)` when the selected slice changes, and skips notifications when the default `Object.is` (or a custom `equalityFn`) considers the previous and next selections equal. This is a distinct, backward-compatible method; the existing `subscribe(listener)` signature is unchanged.

### Patch Changes

- c7bf6f9: Introduce Changesets for automated versioning and changelog management
