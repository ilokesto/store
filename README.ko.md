# @ilokesto/store

[English](./README.md) | **한국어**

작고 단순한 TypeScript Store 클래스입니다.

현재 패키지는 React 전역 상태 관리 라이브러리를 만들기 위한 **vanilla store core**에 가깝습니다. React 의존성 없이 상태 저장, 업데이트, 구독 기능만 제공합니다.

## Features

- 제네릭 기반 `Store<T>`
- 현재 상태 조회: `getState()`
- 초기 상태 조회: `getInitialState()`
- 값 또는 updater 함수로 상태 변경: `setState()`
- 구독 / 해제: `subscribe()`
- 같은 참조로 업데이트하면 notify 생략
- notify 중 구독 해제가 일어나도 안전하게 순회

## Installation

```bash
pnpm add @ilokesto/store
```

또는

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

초기 상태로 Store 인스턴스를 생성합니다.

```ts
const store = new Store({ count: 0 });
```

### `store.getState(): Readonly<T>`

현재 상태 스냅샷을 반환합니다.

```ts
const state = store.getState();
```

### `store.getInitialState(): Readonly<T>`

Store 생성 시 전달한 초기 상태를 반환합니다.

```ts
const initialState = store.getInitialState();
```

### `store.setState(nextState: T | ((prevState: Readonly<T>) => T)): void`

상태를 새 값으로 교체하거나, 이전 상태를 기반으로 다음 상태를 계산합니다.

```ts
store.setState({ count: 10 });

store.setState((prev) => ({
  count: prev.count + 1,
}));
```

`Object.is(prevState, nextState)`가 `true`면 구독자에게 알리지 않습니다.

`setState()`에 전달한 함수는 항상 updater로 해석됩니다. 따라서 현재 API는 **함수 자체를 상태값으로 다루는 패턴**과는 맞지 않습니다.

### `store.subscribe(listener: () => void): () => void`

상태가 바뀔 때 실행할 listener를 등록합니다. 반환값은 unsubscribe 함수입니다.

```ts
const unsubscribe = store.subscribe(() => {
  console.log("state changed");
});

unsubscribe();
```

## State Semantics

이 Store는 상태를 **불변 스냅샷**처럼 다루는 것을 전제로 합니다.

- 상태를 직접 변경하지 말고 항상 `setState()`를 통해 교체하세요.
- 객체/배열 상태는 새 참조를 만들어 반환하는 방식으로 업데이트하세요.
- 같은 참조를 다시 넣으면 변경으로 간주하지 않습니다.

권장 예시:

```ts
store.setState((prev) => ({
  ...prev,
  count: prev.count + 1,
}));
```

비권장 예시:

```ts
store.setState((prev) => {
  prev.count += 1;
  return prev;
});
```

## Current Scope

이 패키지는 현재 아래 기능만 담당합니다.

- 상태 저장
- 상태 교체
- 구독 관리

아직 포함하지 않는 것:

- React hooks
- selector / equality helpers
- middleware
- devtools integration
- persistence helpers

즉, 이 패키지는 완성형 React 상태 관리 라이브러리라기보다 그 기반이 되는 최소 코어입니다.

## Development

```bash
pnpm install
pnpm run build
```

빌드 결과물은 `dist` 디렉터리에 생성됩니다.

## License

MIT
