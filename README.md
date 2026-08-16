> [!IMPORTANT]
> This repository is archived. Development has moved to [ayden94/ilokesto](https://github.com/ayden94/ilokesto), under [`packages/store`](https://github.com/ayden94/ilokesto/tree/main/packages/store). Please open new issues and pull requests in the monorepo.

# @ilokesto/store

**English** | [한국어](./README.ko.md)

A small and simple TypeScript Store class.

This package serves as a **vanilla store core** for building React state management libraries. It provides state storage, updates, and subscription features without any React dependencies.

## Features

- Generic-based `Store<T>`
- Get current state: `getState()`
- Get initial state: `getInitialState()`
- Update state with value or updater function: `setState()`
- Register middleware: `pushMiddleware()` / `unshiftMiddleware()`
- Subscribe / Unsubscribe: `subscribe()`
- Subscribe to a derived selection: `subscribeSelector(selector, listener, equalityFn?)`
- Skips notifications when updated with the same reference
- Skips selector notifications when the selected value is considered equal
- Safely iterates listeners even if unsubscriptions occur during notification

## Installation

```bash
pnpm add @ilokesto/store
```

or

```bash
npm install @ilokesto/store
```

## Basic Usage

```ts
import { Store } from "@ilokesto/store";

type CounterState = {
  count: number;
};

const counterStore = new Store<CounterState>({ count: 0 });

const unsubscribe = counterStore.subscribe(() => {
  console.log("changed:", counterStore.getState());
});

counterStore.setState({ count: 1 });
counterStore.setState((prev) => ({ count: prev.count + 1 }));

console.log(counterStore.getInitialState());
console.log(counterStore.getState());

unsubscribe();
```

## API

### `new Store<T>(initialState: T)`

Creates a Store instance with the initial state.

```ts
const store = new Store({ count: 0 });
```

### `store.getState(): Readonly<T>`

Returns a snapshot of the current state.

```ts
const state = store.getState();
```

### `store.getInitialState(): Readonly<T>`

Returns the initial state provided when the Store was created.

```ts
const initialState = store.getInitialState();
```

### `store.setState(nextState: SetStateAction<T>): void`

Replaces the state with a new value or computes the next state based on the previous one.

```ts
store.setState({ count: 10 });

store.setState((prev) => ({
  count: prev.count + 1,
}));
```

It does not notify subscribers if `Object.is(prevState, nextState)` is `true`.

Functions passed to `setState()` are always treated as updaters. As a result, the current API is not suitable for patterns where the state value itself is a function.

### `store.pushMiddleware(middleware: (nextState: SetStateAction<T>, next: Dispatch<SetStateAction<T>>) => void): void`

Adds a middleware to the end of the chain. Middlewares wrap the `setState` operation and run in the order they were registered.

```ts
store.pushMiddleware((nextState, next) => {
  console.log("Before update:", nextState);
  next(nextState);
  console.log("After update");
});
```

### `store.unshiftMiddleware(middleware: (nextState: SetStateAction<T>, next: Dispatch<SetStateAction<T>>) => void): void`

Adds a middleware to the beginning of the chain. Use this when you need a middleware to run before previously registered ones.

```ts
store.unshiftMiddleware((nextState, next) => {
  console.log("Outermost middleware");
  next(nextState);
});
```

A middleware receives the `nextState: SetStateAction<T>` and a `next: Dispatch<SetStateAction<T>>` function to continue the chain. The first middleware in the array becomes the outermost wrapper, so a `before -> next -> after` pattern runs like nested function calls around the final state application. The final `next` call applies the state and notifies subscribers.

### `store.subscribe(listener: () => void): () => void`

Registers a listener to be executed when the state changes. Returns an unsubscribe function.

```ts
const unsubscribe = store.subscribe(() => {
  console.log("state changed");
});

unsubscribe();
```

### `store.subscribeSelector<Selection>(selector, listener, equalityFn?): () => void`

Subscribes to a derived slice of state instead of the whole store. `subscribeSelector` is a distinct method from `subscribe(listener)`; it does not change the signature of `subscribe`, which keeps `override subscribe(...)` working in subclasses. The listener is **not** invoked immediately when you call `subscribeSelector()`. It runs only when the store updates and the selected value changes.

```ts
type User = { id: string; name: string };
type UserState = { user: User; revision: number };

const userStore = new Store<UserState>({
  user: { id: "1", name: "Ada" },
  revision: 0,
});

const unsubscribe = userStore.subscribeSelector(
  (state) => state.user,
  (nextUser, previousUser) => {
    console.log("user changed:", previousUser.name, "->", nextUser.name);
  }
);

userStore.setState((prev) => ({
  ...prev,
  user: { ...prev.user, name: "Grace" },
  revision: prev.revision + 1,
}));

unsubscribe();
```

The listener receives `(nextSelection, previousSelection)`. Use `next` to read the new slice and `previous` to compare against what it was before.

Equality defaults to `Object.is`. Pass a custom `equalityFn(previous, next)` when the selected value is a fresh reference each time but should still be treated as unchanged (for example, a user object with the same `id`):

```ts
const unsubscribe = userStore.subscribeSelector(
  (state) => state.user,
  (nextUser) => {
    console.log("user identity changed:", nextUser.id);
  },
  (previousUser, nextUser) => previousUser.id === nextUser.id
);
```

If `Object.is` (or your `equalityFn`) considers the previous and next selections equal, the listener is skipped for that update, even when the underlying state reference changed. This is how you avoid re-rendering on a state change that did not actually affect the slice you care about.

Selector subscriptions are plain listeners under the hood, so they follow the same rules as the single-argument form: they run after the state is stored, they do not run when `setState()` resolves to the same reference, and they are removed by calling the returned unsubscribe function.

The selector runs once during `subscribeSelector()` to seed `previousSelection`. A throw at registration escapes the `subscribeSelector()` call and the listener is never added to the store. Wrap registration-time selector work in a try/catch if the slice may be temporarily invalid.

After every top-level state change that reaches notification, the selector runs again to compute `nextSelection`, then the equality function runs against `previousSelection` and `nextSelection`. The listener runs only when the equality function reports a change; otherwise the notification cycle for this subscription ends there. The store does not catch errors thrown during this cycle: an uncaught throw propagates out of `setState()` and any later listeners (selector or plain) that would have run in the same notification cycle are skipped. Keep the selector, equality function, and listener small, or catch expected errors inside the listener.

## State Semantics

This Store treats state as **immutable snapshots**.

- Always update state via `setState()` instead of modifying it directly.
- Update object or array states by returning a new reference.
- Providing the same reference will not be considered a change.

Recommended:

```ts
store.setState((prev) => ({
  ...prev,
  count: prev.count + 1,
}));
```

Not recommended:

```ts
store.setState((prev) => {
  prev.count += 1;
  return prev;
});
```

## Current Scope

This package currently handles only the following:

- State storage
- State replacement
- Subscription management
- Selector-based subscriptions with optional equality function
- Middleware support

It does not yet include:

- React hooks
- DevTools integration
- Persistence helpers

This package is a minimal core rather than a full featured React state management library.

## Development

```bash
pnpm install
pnpm run build
```

Build outputs are generated in the `dist` directory.

## License

MIT
