import type { ReadableStore, Unsubscribe } from "./index.js";

/** A readable whose owner can terminate all subscriptions and future use. */
export interface DisposableReadableStore<T> extends ReadableStore<T> {
  /** Terminal and idempotent; future reads and subscriptions throw. */
  dispose(): void;
}

/** Registers owned cleanup, including resources acquired before startup fails. */
export interface LifecycleScope {
  /** Runs once on shutdown, in reverse registration order. */
  onCleanup(cleanup: Unsubscribe): void;
}

/** Starts on the first subscription; may return one additional cleanup. */
export type LifecycleStart = (scope: LifecycleScope) => void | Unsubscribe;

type Registration = {
  active: boolean;
  stop?: Unsubscribe;
};

type Activation = {
  active: boolean;
  cleanups: Unsubscribe[];
};

/**
 * Adds first-subscription startup and last-unsubscription cleanup to a readable.
 * Duplicate listeners remain independently owned. Startup failure cancels the
 * activation's subscriptions and runs already registered cleanup.
 * @example
 * const live = withLifecycle(store, ({ onCleanup }) => {
 *   onCleanup(connect(message => store.set(message)));
 * });
 */
export function withLifecycle<T>(
  source: ReadableStore<T>,
  start: LifecycleStart
): DisposableReadableStore<T> {
  const registrations = new Set<Registration>();
  let activation: Activation | undefined;
  let transitioning = false;
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("Readable store is disposed");
    }
  };

  const stopRegistration = (registration: Registration, errors: unknown[]) => {
    if (!registration.active) {
      return;
    }
    registration.active = false;
    registrations.delete(registration);
    const stop = registration.stop;
    registration.stop = undefined;
    try {
      stop?.();
    } catch (error) {
      errors.push(error);
    }
  };

  const reconcile = (errors: unknown[]) => {
    if (transitioning) {
      return;
    }
    transitioning = true;
    try {
      while (true) {
        if (activation !== undefined && (disposed || registrations.size === 0)) {
          const previous = activation;
          activation = undefined;
          previous.active = false;
          for (const cleanup of previous.cleanups.reverse()) {
            try {
              cleanup();
            } catch (error) {
              errors.push(error);
            }
          }
          previous.cleanups.length = 0;
        } else if (activation === undefined && !disposed && registrations.size > 0) {
          const current: Activation = { active: true, cleanups: [] };
          activation = current;
          const scope: LifecycleScope = {
            onCleanup(cleanup) {
              if (current.active) {
                current.cleanups.push(cleanup);
              } else {
                cleanup();
              }
            },
          };
          try {
            const cleanup = start(scope);
            if (cleanup !== undefined) {
              scope.onCleanup(cleanup);
            }
          } catch (error) {
            errors.push(error);
            for (const registration of registrations) {
              stopRegistration(registration, errors);
            }
          }
        } else {
          break;
        }
      }
    } finally {
      transitioning = false;
    }
  };

  const throwErrors = (errors: unknown[]) => {
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Readable lifecycle failed");
    }
  };

  const subscribe = (register: () => Unsubscribe): Unsubscribe => {
    assertActive();
    const registration: Registration = { active: true };
    const errors: unknown[] = [];
    registrations.add(registration);
    try {
      const stop = register();
      if (registration.active) {
        registration.stop = stop;
      } else {
        stop();
      }
    } catch (error) {
      errors.push(error);
      stopRegistration(registration, errors);
    }
    reconcile(errors);
    throwErrors(errors);
    return () => {
      const cleanupErrors: unknown[] = [];
      stopRegistration(registration, cleanupErrors);
      reconcile(cleanupErrors);
      throwErrors(cleanupErrors);
    };
  };

  return {
    getState() {
      assertActive();
      return source.getState();
    },
    getInitialState() {
      assertActive();
      return source.getInitialState();
    },
    subscribe: (listener) => subscribe(() => source.subscribe(listener)),
    subscribeSelector: (selector, listener, equalityFn) =>
      subscribe(() => source.subscribeSelector(selector, listener, equalityFn)),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const errors: unknown[] = [];
      for (const registration of registrations) {
        stopRegistration(registration, errors);
      }
      reconcile(errors);
      throwErrors(errors);
    },
  };
}
