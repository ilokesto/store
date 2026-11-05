import {
  deferNotification,
  getBatchSequence,
  hasDeferredNotifications,
  NotificationError,
  runNotifications,
} from "./batch.js";

export { batch } from "./batch.js";
export { derived } from "./derived.js";
export type { DerivedOptions, SourceValues } from "./derived.js";
export { focus } from "./focus.js";
export type { WritableFocus } from "./focus.js";
export { createStoreFamily } from "./createStoreFamily.js";
export type { StoreFamily, StoreFamilyOptions } from "./createStoreFamily.js";
export { memoizeSelector } from "./memoizeSelector.js";
export type { MemoizedSelector, MemoizeSelectorOptions } from "./memoizeSelector.js";
export { trackedDerived } from "./trackedDerived.js";
export type { TrackedDerivedOptions } from "./trackedDerived.js";
export { withLifecycle } from "./withLifecycle.js";
export type {
  DisposableReadableStore,
  LifecycleScope,
  LifecycleStart,
} from "./withLifecycle.js";

/**
 * Receives an invalidation without arguments; read the latest state separately.
 * @example
 * const listener: Listener = () => render(store.getState());
 */
export type Listener = () => void;
/**
 * Stops one subscription immediately, including its pending notifications.
 * Repeated calls are safe.
 * @example
 * const unsubscribe: Unsubscribe = store.subscribe(listener);
 * unsubscribe();
 */
export type Unsubscribe = () => void;
/**
 * Accepts one value or action without returning a result.
 * @example
 * const dispatch: Dispatch<number> = value => store.set(value);
 */
export type Dispatch<A> = (value: A) => void;
/**
 * A replacement value or an updater evaluated against the current state.
 * Use {@link Store.set} when the replacement itself is a function.
 * @example
 * const increment: SetStateAction<number> = previous => previous + 1;
 */
export type SetStateAction<S> = S | ((prevState: S) => S);
/**
 * Preserves callable snapshots and makes other snapshots shallowly readonly.
 * Values are not cloned or frozen at runtime.
 * @example
 * const callback: Snapshot<(value: number) => string> = value => `${value}`;
 */
export type Snapshot<T> = T extends (...args: never[]) => unknown ? T : Readonly<T>;
/**
 * Selects a value from a captured committed state without mutating it.
 * @example
 * const count: Selector<{ count: number }, number> = state => state.count;
 */
export type Selector<T, Selection> = (state: Snapshot<T>) => Selection;
/**
 * Receives the next selection followed by its previous delivered baseline.
 * The baseline advances before this callback, even if the callback throws.
 * @example
 * const listener: SelectorListener<number> = (next, previous) => record(next - previous);
 */
export type SelectorListener<Selection> = (
  nextSelection: Selection,
  previousSelection: Selection
) => void;
/**
 * Compares the previous selection with the next; `true` skips delivery.
 * A skipped selection does not replace the previous baseline.
 * @example
 * const sameId: EqualityFn<{ id: string }> = (previous, next) => previous.id === next.id;
 */
export type EqualityFn<Selection> = (
  previousSelection: Selection,
  nextSelection: Selection
) => boolean;
/**
 * Intercepts a state action; forward it with `next` to continue the pipeline.
 * Calling `next` may synchronously notify subscribers and throw their errors.
 * @example
 * const ignoreNegative: Middleware<number> = (action, next) => {
 *   if (typeof action === "number" && action < 0) return;
 *   next(action);
 * };
 */
export type Middleware<T> = (
  nextState: SetStateAction<T>,
  next: Dispatch<SetStateAction<T>>
) => void;

/**
 * Structural read/subscription contract for framework bindings and consumers.
 * Readonly snapshots are shallow types, not cloned or frozen runtime values.
 * @example
 * const readable: ReadableStore<number> = createStore(0);
 * readable.subscribeSelector(value => value, (next, previous) => record(next, previous));
 */
export interface ReadableStore<T> {
  /** Returns the latest committed value, including during reentrant delivery. */
  getState(): Snapshot<T>;
  /** Returns the original value supplied at construction, without cloning it. */
  getInitialState(): Snapshot<T>;
  /** Registers an independent invalidation callback; does not call it immediately. */
  subscribe(listener: Listener): Unsubscribe;
  /**
   * Registers a selection callback with `Object.is` equality by default.
   * Initial selection is evaluated immediately, but the listener is not called.
   * A selector failure during registration propagates without subscribing.
   */
  subscribeSelector<Selection>(
    selector: Selector<T, Selection>,
    listener: SelectorListener<Selection>,
    equalityFn?: EqualityFn<Selection>
  ): Unsubscribe;
}

/**
 * Structural writable store contract, including middleware registration.
 * @example
 * const writable: StoreApi<number> = createStore(0);
 * writable.update(previous => previous + 1);
 */
export interface StoreApi<T> extends ReadableStore<T> {
  /** Sends a replacement or updater through the middleware pipeline. */
  setState(nextState: SetStateAction<T>): void;
  /** Sends a literal replacement, including a function value, through middleware. */
  set(value: T): void;
  /** Sends an updater through middleware; returning the same value skips a commit. */
  update(updater: (previousState: T) => T): void;
  /** Appends middleware after previously registered middleware. */
  pushMiddleware(middleware: Middleware<T>): void;
  /** Prepends middleware before previously registered middleware. */
  unshiftMiddleware(middleware: Middleware<T>): void;
}

type Subscription<T> = {
  active: boolean;
  readonly notify: (state: Snapshot<T>) => void;
};

/**
 * Captured changed state, its predecessor, and its store-local commit identity.
 * @example
 * store.subscribeCommit(commit => record(commit.sequence, commit.state));
 */
export type StoreCommit<T> = {
  /** Value committed by this change, even when newer commits already exist. */
  readonly state: Snapshot<T>;
  /** Value immediately before this commit. */
  readonly previousState: Snapshot<T>;
  /** Monotonically increasing number; the first changed value has sequence 1. */
  readonly sequence: number;
  /** Caller-supplied replacement identity; ordinary updates use undefined. */
  readonly source: unknown;
};

type Notification<T> = {
  readonly state: T;
  readonly subscriptions: readonly Subscription<T>[];
  readonly commit: StoreCommit<T>;
  readonly observers: readonly CommitSubscription<T>[];
  readonly batchSequence: number | undefined;
};

type BatchedNotification<T> = {
  state: T;
  readonly subscriptions: Set<Subscription<T>>;
  readonly batchSequence?: number;
};

type CommitSubscription<T> = {
  active: boolean;
  readonly notify: (commit: StoreCommit<T>) => void;
};

/**
 * @description Framework-neutral state container with synchronous commits and FIFO delivery.
 *
 * Each changed value captures the current subscriptions. Reentrant commits
 * enqueue notifications rather than recursively delivering them. Subscriber,
 * selector and equality failures are collected until the queue drains, then
 * thrown as an `AggregateError` in delivery order; committed state is retained.
 *
 * @example
 * const store = new Store({ count: 0 });
 * const unsubscribe = store.subscribeSelector(
 *   state => state.count,
 *   (next, previous) => record(next, previous),
 * );
 * store.update(state => ({ count: state.count + 1 }));
 * unsubscribe();
 */
export class Store<T> implements StoreApi<T> {
  private state: T;
  private readonly subscriptions = new Set<Subscription<T>>();
  private readonly notifications: Notification<T>[] = [];
  private notifying = false;
  private readonly middlewares: Middleware<T>[] = [];
  private cachedRunner: Dispatch<SetStateAction<T>> | null = null;
  private sequence = 0;
  private readonly commitObservers = new Set<CommitSubscription<T>>();
  private batchedNotification: BatchedNotification<T> | undefined;

  /**
   * @description Stores the initial value as-is, including callable values.
   * @param {T} initialState - Original value retained without cloning or invoking functions.
   * @example
   * const store = new Store(() => "initial");
   */
  constructor(private readonly initialState: T) {
    this.state = initialState;
  }

  /**
   * @description Returns the latest committed value without cloning or freezing it.
   * @returns {Snapshot<T>} Latest committed snapshot, not a frozen copy.
   * @example
   * const count = createStore(1).getState();
   */
  getState(): Snapshot<T> {
    return this.state as Snapshot<T>;
  }

  /**
   * @description Returns the original constructor value, even after later replacements.
   * @returns {Snapshot<T>} Original snapshot retained at construction.
   * @example
   * const store = createStore(1);
   * store.set(2);
   * const initial = store.getInitialState(); // 1
   */
  getInitialState(): Snapshot<T> {
    return this.initialState as Snapshot<T>;
  }

  /**
   * @description Returns the latest commit number; unchanged or rejected updates do not advance it.
   * @returns {number} Store-local count of changed commits.
   * @example
   * const before = store.getCommitSequence();
   */
  getCommitSequence(): number {
    return this.sequence;
  }

  /**
   * @description Observes captured commits before ordinary subscribers, in FIFO order.
   * Observer errors join notification errors and never roll back a commit.
   * @param {(commit: StoreCommit<T>) => void} listener - Observer receiving each captured commit before ordinary delivery.
   * @returns {Unsubscribe} Idempotent disposer for this commit observer.
   * @example
   * const stop = store.subscribeCommit(({ state, sequence }) => save(state, sequence));
   */
  subscribeCommit(listener: (commit: StoreCommit<T>) => void): Unsubscribe {
    const observer = { active: true, notify: listener };
    this.commitObservers.add(observer);
    return () => {
      observer.active = false;
      this.commitObservers.delete(observer);
    };
  }

  /**
   * @description Immediately commits a literal value through the normal notification engine,
   * bypassing middleware. The optional source identifies only this commit.
   * @param {T} value - Literal replacement that bypasses middleware.
   * @param {unknown} [source] - Identity associated only with this commit.
   * @example
   * store.replaceState(snapshot, replayToken);
   */
  replaceState(value: T, source?: unknown): void {
    this.applyState(() => value, source);
  }

  /**
   * @description Runs a replacement or updater through middleware in registration order.
   * A resolved value equal under `Object.is` does not commit or notify.
   * Middleware may delay, transform or discard the action.
   * @param {SetStateAction<T>} nextState - Replacement or updater passed through middleware.
   * @example
   * const store = createStore(0);
   * store.setState(previous => previous + 1);
   */
  setState(nextState: SetStateAction<T>): void {
    this.getRunner()(nextState);
  }

  /**
   * @description Replaces the value through middleware without invoking callable state.
   * Non-callable replacements reach middleware unchanged, as with `setState(value)`.
   * @param {T} value - Literal replacement, including callable values.
   * @example
   * const store = createStore(() => "initial");
   * store.set(() => "replacement");
   */
  set(value: T): void {
    this.setState(typeof value === "function" ? () => value : value);
  }

  /**
   * @description Computes a replacement through the same middleware pipeline as `setState`.
   * @param {(previousState: T) => T} updater - Computes the next state from the current state.
   * @example
   * const store = createStore(0);
   * store.update(previous => previous + 1);
   */
  update(updater: (previousState: T) => T): void {
    this.setState(updater);
  }

  /**
   * @description Appends middleware and invalidates the cached pipeline for future actions.
   * @param {Middleware<T>} middleware - Interceptor appended after existing middleware.
   * @example
   * store.pushMiddleware((action, next) => next(action));
   */
  pushMiddleware(middleware: Middleware<T>): void {
    this.middlewares.push(middleware);
    this.cachedRunner = null;
  }

  /**
   * @description Prepends middleware and invalidates the cached pipeline for future actions.
   * @param {Middleware<T>} middleware - Interceptor prepended before existing middleware.
   * @example
   * store.unshiftMiddleware((action, next) => next(action));
   */
  unshiftMiddleware(middleware: Middleware<T>): void {
    this.middlewares.unshift(middleware);
    this.cachedRunner = null;
  }

  /**
   * @description Registers an argument-free callback without immediately invoking it.
   * Duplicate callbacks own independent disposers; removal takes effect
   * immediately, even if the callback has a queued notification.
   * @param {Listener} listener - Invalidation callback; read current state separately.
   * @returns {Unsubscribe} Idempotent disposer that suppresses pending delivery.
   * @example
   * const unsubscribe = store.subscribe(() => render(store.getState()));
   * unsubscribe();
   */
  subscribe(listener: Listener): () => void {
    return this.addSubscription(() => listener());
  }

  /**
   * @description Subscribes to selected committed values, using `Object.is` by default.
   * Selectors read captured commit values, whereas `getState()` reads the latest
   * state. A selector/equality failure preserves the previous baseline; a
   * listener failure occurs after the baseline advances.
   * @param {Selector<T, Selection>} selector - Pure selector of captured committed state.
   * @param {SelectorListener<Selection>} listener - Receives next selection and previous delivered baseline.
   * @param {EqualityFn<Selection>} [equalityFn] - Comparison that skips equal selections; defaults to Object.is.
   * @returns {Unsubscribe} Idempotent disposer for this selected subscription.
   * @example
   * const store = createStore({ count: 0 });
   * const unsubscribe = store.subscribeSelector(
   *   state => state.count,
   *   (next, previous) => record(next, previous),
   * );
   */
  subscribeSelector<Selection>(
    selector: Selector<T, Selection>,
    listener: SelectorListener<Selection>,
    equalityFn: EqualityFn<Selection> = Object.is
  ): () => void {
    let previousSelection = selector(this.state as Snapshot<T>);
    const selectorListener = (state: Snapshot<T>) => {
      const nextSelection = selector(state);

      if (equalityFn(previousSelection, nextSelection)) {
        return;
      }

      const currentPreviousSelection = previousSelection;
      previousSelection = nextSelection;
      listener(nextSelection, currentPreviousSelection);
    };

    return this.addSubscription(selectorListener);
  }

  private addSubscription(notify: (state: Snapshot<T>) => void): Unsubscribe {
    const subscription: Subscription<T> = { active: true, notify };
    this.subscriptions.add(subscription);
    return () => {
      subscription.active = false;
      this.subscriptions.delete(subscription);
    };
  }

  private getRunner(): Dispatch<SetStateAction<T>> {
    if (this.cachedRunner !== null) {
      return this.cachedRunner;
    }

    if (this.middlewares.length === 0) {
      this.cachedRunner = (state) => this.applyState(state);
      return this.cachedRunner;
    }

    this.cachedRunner = [...this.middlewares].reduceRight<
      Dispatch<SetStateAction<T>>
    >(
      (next, middleware) => {
        return (state: SetStateAction<T>) => middleware(state, next);
      },
      (state: SetStateAction<T>) => this.applyState(state)
    );

    return this.cachedRunner;
  }

  private applyState(nextState: SetStateAction<T>, source?: unknown): void {
    const prevState = this.state;
    const resolvedState =
      typeof nextState === "function"
        ? (nextState as (prevState: T) => T)(prevState)
        : nextState;

    if (Object.is(prevState, resolvedState)) {
      return;
    }

    this.state = resolvedState;
    this.notifications.push({
      state: resolvedState,
      subscriptions: [...this.subscriptions],
      commit: {
        state: resolvedState as Snapshot<T>,
        previousState: prevState as Snapshot<T>,
        sequence: ++this.sequence,
        source,
      },
      observers: [...this.commitObservers],
      batchSequence: getBatchSequence(),
    });
    this.flushNotifications();
  }

  private flushNotifications(initial?: BatchedNotification<T>): void {
    if (this.notifying) return;

    runNotifications(() => this.deliverNotifications(initial));
  }

  private deliverNotifications(initial?: BatchedNotification<T>): void {
    this.notifying = true;
    const errors: unknown[] = [];
    const deliver = (state: T, subscriptions: Iterable<Subscription<T>>) => {
      for (const subscription of subscriptions) {
        if (!subscription.active) continue;
        try {
          subscription.notify(state as Snapshot<T>);
        } catch (error) {
          errors.push(error);
        }
      }
    };
    try {
      if (initial !== undefined) {
        deliver(initial.state, initial.subscriptions);
      }
      // Reentrant commits append to this queue; they never recurse into delivery.
      for (const notification of this.notifications) {
        for (const observer of notification.observers) {
          if (!observer.active) continue;
          try {
            observer.notify(notification.commit);
          } catch (error) {
            errors.push(error);
          }
        }
        if (notification.batchSequence !== undefined) {
          if (this.batchedNotification?.batchSequence !== notification.batchSequence) {
            const pending: BatchedNotification<T> = {
              state: notification.state,
              subscriptions: new Set(),
              batchSequence: notification.batchSequence,
            };
            this.batchedNotification = pending;
            deferNotification(() => {
              if (this.batchedNotification === pending) {
                this.batchedNotification = undefined;
              }
              this.flushNotifications(pending);
            });
          }
          this.batchedNotification.state = notification.state;
          for (const subscription of notification.subscriptions) {
            this.batchedNotification.subscriptions.add(subscription);
          }
        } else if (hasDeferredNotifications()) {
          // An intervening non-batched commit must not overtake a queued batch.
          this.batchedNotification = undefined;
          deferNotification(() => this.flushNotifications({
            state: notification.state,
            subscriptions: new Set(notification.subscriptions),
          }));
        } else {
          deliver(notification.state, notification.subscriptions);
        }
      }
    } finally {
      this.notifications.length = 0;
      this.notifying = false;
    }
    if (errors.length > 0) {
      throw new NotificationError(errors, "Store notification failed");
    }
  }
}

/**
 * @description Creates a fresh {@link Store}; the argument is always the initial value.
 * Functions are stored rather than called as lazy initializers.
 * @param {T} initialState - Original value retained by `getInitialState()`.
 * @returns {Store<T>} An independent store with no subscriptions or middleware.
 * @example
 * const store = createStore({ count: 0 });
 * store.update(state => ({ count: state.count + 1 }));
 */
export function createStore<T>(initialState: T): Store<T> {
  return new Store(initialState);
}
