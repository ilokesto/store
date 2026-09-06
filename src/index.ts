export type Listener = () => void;
export type Unsubscribe = () => void;
export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((prevState: S) => S);
export type Selector<T, Selection> = (state: Readonly<T>) => Selection;
export type SelectorListener<Selection> = (
  nextSelection: Selection,
  previousSelection: Selection
) => void;
export type EqualityFn<Selection> = (
  previousSelection: Selection,
  nextSelection: Selection
) => boolean;
export type Middleware<T> = (
  nextState: SetStateAction<T>,
  next: Dispatch<SetStateAction<T>>
) => void;

export interface ReadableStore<T> {
  getState(): Readonly<T>;
  getInitialState(): Readonly<T>;
  subscribe(listener: Listener): Unsubscribe;
  subscribeSelector<Selection>(
    selector: Selector<T, Selection>,
    listener: SelectorListener<Selection>,
    equalityFn?: EqualityFn<Selection>
  ): Unsubscribe;
}

export interface StoreApi<T> extends ReadableStore<T> {
  setState(nextState: SetStateAction<T>): void;
  set(value: T): void;
  update(updater: (previousState: T) => T): void;
  pushMiddleware(middleware: Middleware<T>): void;
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

export class Store<T> implements StoreApi<T> {
  private state: T;
  private readonly subscriptions = new Set<Subscription<T>>();
  private readonly notifications: Notification<T>[] = [];
  private notifying = false;
  private readonly middlewares: Middleware<T>[] = [];
  private cachedRunner: Dispatch<SetStateAction<T>> | null = null;

  constructor(private readonly initialState: T) {
    this.state = initialState;
  }

  getState(): Readonly<T> {
    return this.state;
  }

  getInitialState(): Readonly<T> {
    return this.initialState;
  }

  setState(nextState: SetStateAction<T>): void {
    this.getRunner()(nextState);
  }

  /** Replace the value, without interpreting callable state as an updater. */
  set(value: T): void {
    this.setState(() => value);
  }

  /** Compute a replacement through the same middleware pipeline as setState. */
  update(updater: (previousState: T) => T): void {
    this.setState(updater);
  }

  pushMiddleware(middleware: Middleware<T>): void {
    this.middlewares.push(middleware);
    this.cachedRunner = null;
  }

  unshiftMiddleware(middleware: Middleware<T>): void {
    this.middlewares.unshift(middleware);
    this.cachedRunner = null;
  }

  subscribe(listener: Listener): () => void {
    return this.addSubscription(() => listener());
  }

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

/** Create a fresh store; the argument is always the initial value. */
export function createStore<T>(initialState: T): Store<T> {
  return new Store(initialState);
}
