# @ilokesto/store

**English** | [한국어](./README.ko.md)

A small and simple TypeScript Store class.

This package serves as a **vanilla store core** for building React state management libraries. It provides state storage, updates, and subscription features without any React dependencies.

## Features

- Generic-based `Store<T>`
- Get current state: `getState()`
- Get initial state: `getInitialState()`
- Update state with value or updater function: `setState()`
- Subscribe / Unsubscribe: `subscribe()`
- Skips notifications when updated with the same reference
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

### `store.setState(nextState: T | ((prevState: Readonly<T>) => T)): void`

Replaces the state with a new value or computes the next state based on the previous one.

```ts
store.setState({ count: 10 });

store.setState((prev) => ({
  count: prev.count + 1,
}));
```

It does not notify subscribers if `Object.is(prevState, nextState)` is `true`.

Functions passed to `setState()` are always treated as updaters. As a result, the current API is not suitable for patterns where the state value itself is a function.

### `store.subscribe(listener: () => void): () => void`

Registers a listener to be executed when the state changes. Returns an unsubscribe function.

```ts
const unsubscribe = store.subscribe(() => {
  console.log("state changed");
});

unsubscribe();
```

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

It does not yet include:

- React hooks
- Selector / equality helpers
- Middleware
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
