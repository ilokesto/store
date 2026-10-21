type Listener = () => void;
type Dispatch<A> = (value: A) => void;
type SetStateAction<S> = S | ((prevState: S) => S);
type Middleware<T> = (nextState: SetStateAction<T>, next: Dispatch<SetStateAction<T>>) => void;
export declare class Store<T> {
    private readonly initialState;
    private state;
    private readonly listeners;
    private readonly middlewares;
    private cachedRunner;
    constructor(initialState: T);
    getState(): Readonly<T>;
    getInitialState(): Readonly<T>;
    setState(nextState: SetStateAction<T>): void;
    pushMiddleware(middleware: Middleware<T>): void;
    unshiftMiddleware(middleware: Middleware<T>): void;
    subscribe(listener: Listener): (() => void);
    private getRunner;
    private applyState;
    private notify;
}
export {};
