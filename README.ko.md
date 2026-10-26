# @ilokesto/store

불변 상태와 selector 구독을 위한 작고 프레임워크 독립적인 TypeScript 스토어입니다.

[![npm](https://img.shields.io/npm/v/@ilokesto/store?style=flat&color=555)](https://www.npmjs.com/package/@ilokesto/store)
![MIT](https://img.shields.io/badge/license-MIT-555?style=flat)

[문서](./docs/index.ko.mdx) | [API](./docs/reference/store.ko.mdx) | [English](./README.md)

- `createStore()` 또는 `Store<T>`로 타입이 있는 스토어를 만듭니다.
- 명시적인 해제와 동등성 비교로 전체 상태나 선택한 값만 구독합니다.
- 프레임워크 런타임 의존성 없이 쓰기 작업에 미들웨어를 조합합니다.

## 설치

```sh
pnpm add @ilokesto/store
```

`npm install @ilokesto/store`도 사용할 수 있습니다. ESM과 TypeScript 선언을 제공합니다.

## 빠른 시작

카운터를 만들고 count 변화를 구독한 뒤 구독을 해제합니다.

```ts
import { createStore } from '@ilokesto/store';

type CounterState = {
  count: number;
};

const counter = createStore<CounterState>({ count: 0 });

const unsubscribe = counter.subscribeSelector(
  state => state.count,
  (next, previous) => {
    console.log(`${previous} -> ${next}`);
  },
);

counter.set({ count: 1 });
counter.update(previous => ({ count: previous.count + 1 }));

console.log(counter.getInitialState()); // { count: 0 }
console.log(counter.getState()); // { count: 2 }

unsubscribe();
```

스냅샷은 불변 값으로 다루고 객체나 배열을 변경할 때 새 참조를 반환하세요.
상태가 `Object.is`로 같으면 알림을 생략하며 selector의 기본 동등성 비교도 `Object.is`입니다.
등록할 때 selector는 실행하지만 listener를 즉시 호출하지는 않습니다.

프레임워크 hook, 영속화 헬퍼와 DevTools 연동은 상위 계층의 역할입니다.

함수 자체를 포함한 값 교체에는 `set(value)`, 계산에는 `update(updater)`를 사용하세요.
`setState(fn)`은 전달받은 함수를 항상 updater로 해석합니다.

알림은 캡처한 커밋을 동기 FIFO 순서로 전달합니다. Listener 오류는 전달을 마친 뒤
`AggregateError`로 모아 던지며 이미 커밋한 상태를 되돌리지 않습니다.
아래 알림 계약에서 재진입 쓰기, 독립적인 등록, 즉시 구독 해제와
커밋 단위 연동의 의미론을 확인할 수 있습니다.

## 더 알아보기

- [상태 스냅샷과 불변 업데이트](./docs/core-concepts.ko.mdx)
- [값 교체와 updater 의미론](./docs/reference/set-state.ko.mdx)
- [구독, selector, 동등성 비교와 해제](./docs/reference/subscribe.ko.mdx)
- [미들웨어 조합](./docs/guides/composing-middleware.ko.mdx)
- [알림 계약과 커밋 관측](./docs/advanced/notification-semantics.ko.mdx)

<details>
<summary>개발</summary>

Node 24.22.1과 pnpm 10.17.1을 사용하고 저장소 루트에서 실행하세요.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:typecheck
pnpm test:tooling
pnpm migrate:verify
pnpm docs:publication:verify
pnpm docs:typecheck
pnpm docs:build
pnpm docs:test
```

빌드 결과는 `dist/`에 생성됩니다. 전용 문서 사이트를 빌드한 뒤
`pnpm docs:start`로 로컬에서 실행합니다. 공식 영문·한국어 문서는 `docs/`에,
렌더러는 `website/`에 있습니다.

변경 불가능한 문서 기록과 마이그레이션 이력을 보존하세요.
PR에서는 Verify를 실행하고 main 변경 시 Changesets 릴리스 PR을 생성·갱신합니다.
릴리스 PR을 머지하면 해당 main 커밋의 Verify 성공 후 검증된 패키지를 npm에 게시합니다.
적용 전에 Actions의 PR 생성 권한과 Production 환경의 `NPM_TOKEN`을 설정하세요.
로컬 게시나 문서 배포는 하지 않습니다.

</details>
