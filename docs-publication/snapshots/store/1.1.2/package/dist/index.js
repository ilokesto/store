export class Store {
    initialState;
    state;
    listeners = new Set();
    middlewares = [];
    cachedRunner = null;
    constructor(initialState) {
        this.initialState = initialState;
        this.state = initialState;
    }
    getState() {
        return this.state;
    }
    getInitialState() {
        return this.initialState;
    }
    setState(nextState) {
        this.getRunner()(nextState);
    }
    pushMiddleware(middleware) {
        this.middlewares.push(middleware);
        this.cachedRunner = null;
    }
    unshiftMiddleware(middleware) {
        this.middlewares.unshift(middleware);
        this.cachedRunner = null;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    getRunner() {
        if (this.cachedRunner !== null) {
            return this.cachedRunner;
        }
        if (this.middlewares.length === 0) {
            this.cachedRunner = (state) => this.applyState(state);
            return this.cachedRunner;
        }
        this.cachedRunner = [...this.middlewares].reduceRight((next, middleware) => {
            return (state) => middleware(state, next);
        }, (state) => this.applyState(state));
        return this.cachedRunner;
    }
    applyState(nextState) {
        const prevState = this.state;
        const resolvedState = typeof nextState === "function"
            ? nextState(prevState)
            : nextState;
        if (Object.is(prevState, resolvedState)) {
            return;
        }
        this.state = resolvedState;
        this.notify();
    }
    notify() {
        for (const listener of Array.from(this.listeners)) {
            listener();
        }
    }
}
