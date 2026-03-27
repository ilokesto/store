type Listener = () => void;
type Dispatch<A> = (value: A) => void;
type SetStateAction<S> = S | ((prevState: S) => S);
type Middleware<T> = (
  nextState: SetStateAction<T>,
  next: Dispatch<SetStateAction<T>>
) => void;

export class Store<T> {
  private state: T;
  private readonly listeners = new Set<Listener>();
  private readonly middlewares: Middleware<T>[] = [];

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
    const runner = [...this.middlewares].reduceRight<
      Dispatch<SetStateAction<T>>
    >(
      (next, middleware) => {
        return (state: SetStateAction<T>) => middleware(state, next);
      },
      (state: SetStateAction<T>) => this.applyState(state)
    );

    runner(nextState);
  }

  pushMiddleware(middleware: Middleware<T>): void {
    this.middlewares.push(middleware);
  }

  unshiftMiddleware(middleware: Middleware<T>): void {
    this.middlewares.unshift(middleware);
  }

  subscribe(listener: Listener): (() => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
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
    this.notify();
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
