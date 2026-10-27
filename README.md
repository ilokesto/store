# @ilokesto/store

A small, framework-independent TypeScript store for immutable state and selector subscriptions.

[![npm](https://img.shields.io/npm/v/@ilokesto/store?style=flat&color=555)](https://www.npmjs.com/package/@ilokesto/store)
![MIT](https://img.shields.io/badge/license-MIT-555?style=flat)

[한국어](./README.ko.md)

- Create typed stores with `createStore()` or `Store<T>`.
- Subscribe to the whole state or a selection, with explicit cleanup and equality.
- Compose middleware around writes without a framework runtime dependency.

## Installation

```sh
pnpm add @ilokesto/store
```

Or use `npm install @ilokesto/store`. The package ships ESM and TypeScript declarations.

## Quick start

Create a counter, observe its count, then release the subscription:

```ts
import { createStore } from '@ilokesto/store';

type CounterState = {
  count: number;
};

const counter = createStore<CounterState>({ count: 0 });

const unsubscribe = counter.subscribeSelector(
  state => state.count,
  (next, previous) => {
    console.log(`${previous} -> ${next}`);
  },
);

counter.set({ count: 1 });
counter.update(previous => ({ count: previous.count + 1 }));

console.log(counter.getInitialState()); // { count: 0 }
console.log(counter.getState()); // { count: 2 }

unsubscribe();
```

Treat snapshots as immutable: return a fresh object or array when updating.
`Object.is` skips unchanged state; selector equality also defaults to `Object.is`.
Registration evaluates the selector but does not call its listener immediately.

Framework hooks, persistence helpers, and DevTools integrations belong to higher layers.

Use `set(value)` for literal values, including functions, and `update(updater)` for
computation. `setState(fn)` always treats its function argument as an updater.

Notifications drain synchronously in FIFO order using captured commits. Listener
failures are collected into an `AggregateError` after delivery; committed state is
not rolled back. Reentrant writes are queued until the current notification
finishes; unsubscribing takes effect immediately.

<details>
<summary>Development</summary>

Use Node 24.22.1 and pnpm 10.17.1. Run these commands from this repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:typecheck
pnpm test:tooling
```

Build output goes to `dist/`.

Keep migration history intact. Pull requests run Verify; main updates create or
refresh the Changesets release PR. Merging
that release PR publishes its exact verified main artifact to npm after Verify
succeeds. Enable Actions PR creation and provide `NPM_TOKEN` to the Production
environment before rollout. Do not publish locally.

</details>
