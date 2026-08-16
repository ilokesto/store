# @ilokesto/store

[English](./README.md) | **한국어**

작고 단순한 TypeScript Store 클래스입니다.

현재 패키지는 React 전역 상태 관리 라이브러리를 만들기 위한 **vanilla store core**에 가깝습니다. React 의존성 없이 상태 저장, 업데이트, 구독 기능만 제공합니다.

## Features

- 제네릭 기반 `Store<T>`
- 현재 상태 조회: `getState()`
- 초기 상태 조회: `getInitialState()`
- 값 또는 updater 함수로 상태 변경: `setState()`
- 미들웨어 등록: `pushMiddleware()` / `unshiftMiddleware()`
- 구독 / 해제: `subscribe()`
- selector 기반 구독: `subscribeSelector(selector, listener, equalityFn?)`
- 같은 참조로 업데이트하면 notify 생략
- 선택된 값이 같다고 판단되면 selector notify도 생략
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

### `store.setState(nextState: SetStateAction<T>): void`

상태를 새 값으로 교체하거나, 이전 상태를 기반으로 다음 상태를 계산합니다.

```ts
store.setState({ count: 10 });

store.setState((prev) => ({
  count: prev.count + 1,
}));
```

`Object.is(prevState, nextState)`가 `true`면 구독자에게 알리지 않습니다.

`setState()`에 전달한 함수는 항상 updater로 해석됩니다. 따라서 현재 API는 **함수 자체를 상태값으로 다루는 패턴**과는 맞지 않습니다.

### `store.pushMiddleware(middleware: (nextState: SetStateAction<T>, next: Dispatch<SetStateAction<T>>) => void): void`

체인 끝에 미들웨어를 추가합니다. 미들웨어는 `setState` 동작을 감싸며 등록된 순서대로 실행됩니다.

```ts
store.pushMiddleware((nextState, next) => {
  console.log("업데이트 전:", nextState);
  next(nextState);
  console.log("업데이트 후");
});
```

### `store.unshiftMiddleware(middleware: (nextState: SetStateAction<T>, next: Dispatch<SetStateAction<T>>) => void): void`

체인 앞에 미들웨어를 추가합니다. 기존에 등록된 미들웨어보다 먼저 실행되어야 할 때 사용합니다.

```ts
store.unshiftMiddleware((nextState, next) => {
  console.log("가장 바깥쪽 미들웨어");
  next(nextState);
});
```

미들웨어는 `nextState: SetStateAction<T>`와 체인을 이어갈 `next: Dispatch<SetStateAction<T>>` 함수를 인자로 받습니다. 배열의 첫 번째 미들웨어가 가장 바깥쪽 래퍼가 되므로, `before -> next -> after` 패턴은 실제 상태 반영을 감싸는 중첩 함수 호출처럼 동작합니다. 마지막 `next` 호출이 실제로 상태를 적용하고 구독자에게 알림을 보냅니다.

### `store.subscribe(listener: () => void): () => void`

상태가 바뀔 때 실행할 listener를 등록합니다. 반환값은 unsubscribe 함수입니다.

```ts
const unsubscribe = store.subscribe(() => {
  console.log("state changed");
});

unsubscribe();
```

### `store.subscribeSelector<Selection>(selector, listener, equalityFn?): () => void`

전체 store 대신 상태에서 파생된 일부분(slice)에 구독합니다. `subscribeSelector`는 `subscribe(listener)`와 별개의 메서드라서 `subscribe`의 시그니처를 바꾸지 않습니다. 덕분에 서브클래스에서 `override subscribe(...)`를 그대로 유지할 수 있습니다. `subscribeSelector()`를 호출하는 시점에는 listener가 **즉시 호출되지 않습니다**. store가 업데이트되고 선택된 값이 바뀐 뒤에만 실행됩니다.

```ts
type User = { id: string; name: string };
type UserState = { user: User; revision: number };

const userStore = new Store<UserState>({
  user: { id: "1", name: "Ada" },
  revision: 0,
});

const unsubscribe = userStore.subscribeSelector(
  (state) => state.user,
  (nextUser, previousUser) => {
    console.log("user changed:", previousUser.name, "->", nextUser.name);
  }
);

userStore.setState((prev) => ({
  ...prev,
  user: { ...prev.user, name: "Grace" },
  revision: prev.revision + 1,
}));

unsubscribe();
```

listener는 `(nextSelection, previousSelection)`를 인자로 받습니다. `next`로 새 slice를 읽고, `previous`로 직전 값과 비교하세요.

기본 equality는 `Object.is`입니다. 매번 새 참조가 만들어지지만 의미상은 같다고 봐야 하는 경우(예: 같은 `id`를 가진 user 객체)는 직접 `equalityFn(previous, next)`를 넘기세요.

```ts
const unsubscribe = userStore.subscribeSelector(
  (state) => state.user,
  (nextUser) => {
    console.log("user identity changed:", nextUser.id);
  },
  (previousUser, nextUser) => previousUser.id === nextUser.id
);
```

`Object.is` 또는 직접 넘긴 `equalityFn`이 이전/다음 selection을 같다고 판단하면, 내부 상태 참조가 바뀌었더라도 그 업데이트에 대해서는 listener가 실행되지 않습니다. 이 동작이 "실제로 관심 있는 slice에는 영향이 없는 state 변경"으로 인한 재실행을 막아 줍니다.

selector 구독도 내부적으로는 일반 listener와 동일하게 동작하므로, 한 인자 형태의 규칙을 그대로 따릅니다. 즉, 상태가 저장된 뒤에 동기적으로 실행되고, `setState()`가 같은 참조로 계산되면 실행되지 않으며, 반환된 unsubscribe 함수를 호출하면 등록이 해제됩니다.

selector는 `subscribeSelector()`가 처음 호출될 때 한 번 실행되어 이전 `previousSelection`을 시드합니다. 등록 시점에 throw가 발생하면 그 error는 `subscribeSelector()` 호출 밖으로 전파되고 listener는 store에 등록되지 않습니다. 등록 시점에 selection이 일시적으로 잘못될 수 있다면 try/catch로 감싸세요.

이후 top-level 상태 변경이 알림 단계에 도달할 때마다 selector가 다시 실행되어 `nextSelection`을 계산하고, 그 다음 equality 함수가 `previousSelection`과 `nextSelection`을 비교합니다. listener는 equality 함수가 변경을 보고했을 때만 실행되고, 그렇지 않으면 이 구독에 대한 알림 cycle은 여기서 끝납니다. store는 이 cycle 안에서 던지는 error를 잡지 않습니다. 잡히지 않은 throw는 `setState()` 호출 밖으로 그대로 전파되고, 같은 알림 cycle에서 실행될 예정이던 뒤쪽 listener(selector, 일반 모두)는 건너뜁니다. selector, equality 함수, listener는 작게 유지하거나 예상 가능한 error는 listener 안에서 잡으세요.

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
- 선택적 equality 함수를 지원하는 selector 기반 구독
- 미들웨어 지원

아직 포함하지 않는 것:

- React hooks
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
