'use client';

import { Store } from '@ilokesto/store';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { landingPackages } from './landing-packages';
import { LandingShell } from './landing-shell';
import styles from './store-landing.module.css';

export function StoreLanding({ lang }: { readonly lang: 'en' | 'ko' }) {
  const [store] = useState(() => new Store({ count: 0 }));
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState().count, [store]);
  const getInitialSnapshot = useCallback(() => store.getInitialState().count, [store]);
  const count = useSyncExternalStore(subscribe, getSnapshot, getInitialSnapshot);
  const copy = lang === 'ko'
    ? {
        label: '지금 담긴 상태', add: '하나 더', decrease: '1 줄이기', reset: '초기화',
        note: '실제 Store로 동작하는 예제',
      }
    : {
        label: 'A little state', add: 'One more', decrease: 'Decrease by 1', reset: 'Reset',
        note: 'Powered by a real Store',
      };

  return (
    <LandingShell info={landingPackages[0]} lang={lang}>
        <section className={styles.workspace} id="store-demo" data-demo-slot="store" data-demo="store" aria-label={copy.note}>
          <div className={styles.counter}>
            <span className={styles.counterLabel}>{copy.label}</span>
            <output data-demo-result="store-count" aria-live="polite" className={styles.count}>{count}</output>
            <div className={styles.controls}>
              <button type="button" data-demo-action="store-decrement" aria-label={copy.decrease}
                className={styles.decrease} onClick={() => store.setState(state => ({ count: state.count - 1 }))}>
                <Minus size={18} aria-hidden />
              </button>
              <button type="button" data-demo-action="store-increment" className={styles.increase}
                onClick={() => store.setState(state => ({ count: state.count + 1 }))}>
                <Plus size={17} aria-hidden />{copy.add}
              </button>
            </div>
            <button type="button" data-demo-action="store-reset" className={styles.reset}
              onClick={() => store.setState({ count: 0 })}>
              <RotateCcw size={12} aria-hidden />{copy.reset}
            </button>
          </div>

          <div className={styles.codePanel}>
            <div className={styles.codeHeader}><span>store.ts</span><span>TypeScript</span></div>
            <pre tabIndex={0} aria-label={lang === 'ko' ? 'Store 핵심 API 코드' : 'Store core API code'}><code>
              <span className={styles.keyword}>import</span>{' { Store } '}<span className={styles.keyword}>from</span>{' '}<span className={styles.string}>{`'@ilokesto/store'`}</span>{';\n\n'}
              <span className={styles.keyword}>const</span>{' store = '}<span className={styles.keyword}>new</span>{' Store({ count: '}<span className={styles.string}>0</span>{' });\n\n'}
              <span className={styles.comment}>{'// Subscribe to every change'}</span>{'\n'}
              {'store.subscribe(() => {\n  console.log(store.getState().count);\n});\n\n'}
              <span className={styles.comment}>{'// A little more state'}</span>{'\n'}
              {'store.setState(({ count }) => ({\n  count: count + '}<span className={styles.string}>1</span>{',\n}));'}
            </code></pre>
            <div className={styles.console}>
              <span className={styles.liveDot} aria-hidden />
              <span>store.getState()</span>
              <samp data-store-mirror>{'{ count: '}{count}{' }'}</samp>
            </div>
          </div>

        </section>

    </LandingShell>
  );
}
