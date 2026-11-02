let batchDepth = 0;
let batchSequence = 0;
let notificationDepth = 0;
let flushing = false;
const notifications: Array<() => void> = [];
const computations = new Set<() => void>();

/**
 * @description Groups internal delivery failures without unpacking user-thrown errors.
 * @example
 * throw new NotificationError([new Error("listener failed")], "Delivery failed");
 */
export class NotificationError extends AggregateError {}

function collect(errors: unknown[], error: unknown): void {
  if (error instanceof NotificationError) {
    errors.push(...error.errors);
  } else {
    errors.push(error);
  }
}

function flush(errors: unknown[]): void {
  if (batchDepth > 0 || notificationDepth > 0 || flushing) {
    return;
  }

  flushing = true;
  try {
    let index = 0;
    while (index < notifications.length || computations.size > 0) {
      // Ordinary FIFO delivery settles before derived publication. Derived reads
      // pull their inputs, so registration order cannot introduce diamond glitches.
      const next = index < notifications.length
        ? notifications[index++]
        : computations.values().next().value;
      if (next === undefined) {
        break;
      }
      computations.delete(next);
      try {
        next();
      } catch (error) {
        collect(errors, error);
      }
    }
  } finally {
    notifications.length = 0;
    computations.clear();
    flushing = false;
  }
}

/**
 * @description Identifies the current synchronous batch, if any.
 * @returns {number | undefined} Current batch identity, or undefined outside a batch.
 * @example
 * batch(() => { const sequence = getBatchSequence(); });
 */
export function getBatchSequence(): number | undefined {
  return batchDepth > 0 ? batchSequence : undefined;
}

/**
 * @description Reports whether ordinary notifications are waiting for delivery.
 * @returns {boolean} Whether the deferred notification queue is nonempty.
 * @example
 * if (hasDeferredNotifications()) deferNotification(deliver);
 */
export function hasDeferredNotifications(): boolean {
  return notifications.length > 0;
}

/**
 * @description Queues ordinary delivery until the outer notification or batch drains.
 * @param {() => void} notify - Delivery callback appended in FIFO order.
 * @example
 * batch(() => deferNotification(deliver));
 */
export function deferNotification(notify: () => void): void {
  notifications.push(notify);
}

/**
 * @description Deduplicates a computation and runs it after ordinary delivery settles.
 * @param {() => void} compute - Stable callback identity used for deduplication.
 * @example
 * scheduleComputation(publish);
 */
export function scheduleComputation(compute: () => void): void {
  computations.add(compute);
  const errors: unknown[] = [];
  flush(errors);
  if (errors.length > 0) {
    throw new NotificationError(errors, "Store notification failed");
  }
}

/**
 * @description Removes a queued computation without invoking it.
 * @param {() => void} compute - Previously scheduled callback identity.
 * @example
 * cancelComputation(publish);
 */
export function cancelComputation(compute: () => void): void {
  computations.delete(compute);
}

/**
 * @description Runs delivery and drains deferred work before throwing collected failures.
 * @param {() => void} notify - Synchronous delivery operation.
 * @example
 * runNotifications(() => listener());
 */
export function runNotifications(notify: () => void): void {
  const errors: unknown[] = [];
  notificationDepth++;
  try {
    notify();
  } catch (error) {
    collect(errors, error);
  } finally {
    notificationDepth--;
    flush(errors);
  }
  if (errors.length > 0) {
    throw new NotificationError(errors, "Store notification failed");
  }
}

/**
 * @description Coalesces ordinary notifications until the outermost synchronous callback ends.
 * Writes and commit observers remain immediate; errors never roll state back.
 * Promise-returning callbacks are rejected by the type contract. Async work after
 * a callback returns is outside the batch.
 * @param {() => Result} callback - Synchronous work whose writes share deferred delivery.
 * @returns {Result} Callback result after deferred notifications finish.
 * @example
 * batch(() => { first.set(1); second.set(2); });
 */
export function batch<Result>(
  callback: () => Result & (
    Extract<Result, PromiseLike<unknown>> extends never ? unknown : never
  )
): Result {
  let result: Result | undefined;
  let failed = false;
  let failure: unknown;
  const errors: unknown[] = [];
  if (batchDepth === 0) {
    batchSequence++;
  }
  batchDepth++;
  try {
    result = callback();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    batchDepth--;
    flush(errors);
  }
  if (failed) {
    if (errors.length === 0) {
      throw failure;
    }
    throw new NotificationError([failure, ...errors], "Batch callback and notification failed");
  }
  if (errors.length > 0) {
    throw new NotificationError(errors, "Store notification failed");
  }
  return result as Result;
}
