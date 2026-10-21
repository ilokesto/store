'use client';

import { Store } from '@ilokesto/store';
import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  DemoFrame,
  type DemoProps,
  demoButtonClass,
  demoSecondaryButtonClass,
} from './demo-frame';

type CounterState = { count: number };

const code = `const counter = new Store({ count: 0 });

const count = useSyncExternalStore(
  listener => counter.subscribe(listener),
  () => counter.getState().count,
  () => counter.getInitialState().count,
);

counter.setState(({ count }) => ({ count: count + 1 }));
counter.setState(({ count }) => ({ count: count - 1 }));
counter.setState({ count: 0 });`;

export function StoreDemo({ lang }: DemoProps) {
  const [counter] = useState(() => new Store<CounterState>({ count: 0 }));
  const subscribe = useCallback(
    (listener: () => void) => counter.subscribe(listener),
    [counter],
  );
  const getSnapshot = useCallback(() => counter.getState().count, [counter]);
  const getServerSnapshot = useCallback(() => counter.getInitialState().count, [counter]);
  const count = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const copy = lang === 'ko'
    ? {
        title: '구독으로 바로 반응하는 카운터',
        description: '버튼이 Store를 직접 갱신하고, React는 Store 구독으로 최신 값을 표시합니다.',
        value: '현재 값',
        decrease: '1 줄이기',
        increase: '1 늘리기',
        reset: '초기화',
      }
    : {
        title: 'A counter driven by subscriptions',
        description: 'The buttons update a real Store, and React renders the latest value from its subscription.',
        value: 'Current value',
        decrease: 'Decrease by 1',
        increase: 'Increase by 1',
        reset: 'Reset',
      };

  return (
    <DemoFrame
      lang={lang}
      name="store"
      title={copy.title}
      description={copy.description}
      code={code}
    >
      <div className="flex flex-col items-center gap-5 rounded-xl border border-fd-border bg-fd-card p-5 text-center sm:p-6">
        <div>
          <p className="text-sm text-fd-muted-foreground">{copy.value}</p>
          <output
            data-demo-result="store-count"
            aria-live="polite"
            className="mt-1 block font-mono text-4xl font-semibold tabular-nums text-fd-foreground"
          >
            {count}
          </output>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-2">
          <button
            type="button"
            data-demo-action="store-decrement"
            className={demoSecondaryButtonClass}
            onClick={() => counter.setState(state => ({ count: state.count - 1 }))}
          >
            {copy.decrease}
          </button>
          <button
            type="button"
            data-demo-action="store-increment"
            className={demoButtonClass}
            onClick={() => counter.setState(state => ({ count: state.count + 1 }))}
          >
            {copy.increase}
          </button>
          <button
            type="button"
            data-demo-action="store-reset"
            className={demoSecondaryButtonClass}
            onClick={() => counter.setState({ count: 0 })}
          >
            {copy.reset}
          </button>
        </div>
      </div>
    </DemoFrame>
  );
}
