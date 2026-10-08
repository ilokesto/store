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
 * Selects a value from a captured committed state without mutating it.
 * @example
 * const count: Selector<{ count: number }, number> = state => state.count;
 */
export type Selector<T, Selection> = (state: Readonly<T>) => Selection;
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
  getState(): Readonly<T>;
  /** Returns the original value supplied at construction, without cloning it. */
  getInitialState(): Readonly<T>;
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
  readonly notify: (state: Readonly<T>) => void;
};

type Notification<T> = {
  readonly state: T;
  readonly subscriptions: readonly Subscription<T>[];
};

/**
 * Framework-neutral state container with synchronous commits and FIFO delivery.
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

  /**
   * Stores the initial value as-is, including callable values.
   * @example
   * const store = new Store(() => "initial");
   */
  constructor(private readonly initialState: T) {
    this.state = initialState;
  }

  /**
   * Returns the latest committed value without cloning or freezing it.
   * @example
   * const count = createStore(1).getState();
   */
  getState(): Readonly<T> {
    return this.state;
  }

  /**
   * Returns the original constructor value, even after later replacements.
   * @example
   * const store = createStore(1);
   * store.set(2);
   * const initial = store.getInitialState(); // 1
   */
  getInitialState(): Readonly<T> {
    return this.initialState;
  }

  /**
   * Runs a replacement or updater through middleware in registration order.
   * A resolved value equal under `Object.is` does not commit or notify.
   * Middleware may delay, transform or discard the action.
   * @example
   * const store = createStore(0);
   * store.setState(previous => previous + 1);
   */
  setState(nextState: SetStateAction<T>): void {
    this.getRunner()(nextState);
  }

  /**
   * Replaces the value through middleware without invoking callable state.
   * @example
   * const store = createStore(() => "initial");
   * store.set(() => "replacement");
   */
  set(value: T): void {
    this.setState(() => value);
  }

  /**
   * Computes a replacement through the same middleware pipeline as `setState`.
   * @example
   * const store = createStore(0);
   * store.update(previous => previous + 1);
   */
  update(updater: (previousState: T) => T): void {
    this.setState(updater);
  }

  /**
   * Appends middleware and invalidates the cached pipeline for future actions.
   * @example
   * store.pushMiddleware((action, next) => next(action));
   */
  pushMiddleware(middleware: Middleware<T>): void {
    this.middlewares.push(middleware);
    this.cachedRunner = null;
  }

  /**
   * Prepends middleware and invalidates the cached pipeline for future actions.
   * @example
   * store.unshiftMiddleware((action, next) => next(action));
   */
  unshiftMiddleware(middleware: Middleware<T>): void {
    this.middlewares.unshift(middleware);
    this.cachedRunner = null;
  }

  /**
   * Registers an argument-free callback without immediately invoking it.
   * Duplicate callbacks own independent disposers; removal takes effect
   * immediately, even if the callback has a queued notification.
   * @example
   * const unsubscribe = store.subscribe(() => render(store.getState()));
   * unsubscribe();
   */
  subscribe(listener: Listener): () => void {
    return this.addSubscription(() => listener());
  }

  /**
   * Subscribes to selected committed values, using `Object.is` by default.
   * Selectors read captured commit values, whereas `getState()` reads the latest
   * state. A selector/equality failure preserves the previous baseline; a
   * listener failure occurs after the baseline advances.
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
    let previousSelection = selector(this.state);
    const selectorListener = (state: Readonly<T>) => {
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

  private addSubscription(notify: (state: Readonly<T>) => void): Unsubscribe {
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

  private applyState(nextState: SetStateAction<T>): void {
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
    });
    this.flushNotifications();
  }

  private flushNotifications(): void {
    if (this.notifying) return;

    this.notifying = true;
    const errors: unknown[] = [];
    try {
      // Reentrant commits append to this queue; they never recurse into delivery.
      for (const notification of this.notifications) {
        for (const subscription of notification.subscriptions) {
          if (!subscription.active) continue;
          try {
            subscription.notify(notification.state);
          } catch (error) {
            // Preserve arbitrary thrown values and report them after all delivery.
            errors.push(error);
          }
        }
      }
    } finally {
      this.notifications.length = 0;
      this.notifying = false;
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Store notification failed");
    }
  }
}

/**
 * Creates a fresh {@link Store}; the argument is always the initial value.
 * Functions are stored rather than called as lazy initializers.
 * @param initialState - Original value retained by `getInitialState()`.
 * @returns An independent store with no subscriptions or middleware.
 * @example
 * const store = createStore({ count: 0 });
 * store.update(state => ({ count: state.count + 1 }));
 */
export function createStore<T>(initialState: T): Store<T> {
  return new Store(initialState);
}
