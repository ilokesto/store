'use client';

import { Store } from '@ilokesto/store';
import { BookOpen, Minus, Plus } from 'lucide-react';
import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import styles from '../landings/store-landing.module.css';
import { DemoFrame, type DemoProps, demoSecondaryButtonClass } from './demo-frame';

const code = `const cart = new Store({
  quantity: 1, gift: false,
});
cart.subscribe(() => {
  render(cart.getState());
});
cart.setState(state => ({
  ...state,
  quantity: state.quantity + 1,
}));`;

export function StoreDemo({ lang }: DemoProps) {
  const [cart] = useState(() => new Store({ quantity: 1, gift: false }));
  const subscribe = useCallback((listener: () => void) => cart.subscribe(listener), [cart]);
  const snapshot = useCallback(() => cart.getState(), [cart]);
  const initial = useCallback(() => cart.getInitialState(), [cart]);
  const { quantity, gift } = useSyncExternalStore(subscribe, snapshot, initial);
  const giftId = useId();
  const korean = lang === 'ko';
  const total = quantity * 24 + (gift ? 4 : 0);

  return (
    <DemoFrame lang={lang} name="store"
      title={korean ? '작은 장바구니, 하나의 Store' : 'A small cart, one Store'}
      description={korean ? '수량과 포장을 바꾸면 구독 중인 주문 요약이 바로 갱신됩니다.' : 'Change quantity or wrapping. The subscribed order summary updates immediately.'}
      code={code}>
      <div className={styles.demoPreview}>
        <div className={styles.demoRow}>
          <BookOpen size={28} aria-hidden />
          <div>
            <p className="text-sm font-semibold">{korean ? '작업실 노트' : 'Workshop notebook'}</p>
            <p className="text-xs text-fd-muted-foreground">$24 / {korean ? '권' : 'copy'}</p>
          </div>
        </div>
      </div>
      <div className={styles.demoSummary}>
        <span>{korean ? '수량' : 'Quantity'}</span>
        <div className={styles.demoRow}>
          <button type="button" data-demo-action="store-decrement" className={demoSecondaryButtonClass}
            aria-label={korean ? '수량 줄이기' : 'Decrease quantity'} disabled={quantity === 1}
            onClick={() => cart.setState(state => ({ ...state, quantity: state.quantity - 1 }))}>
            <Minus size={16} aria-hidden />
          </button>
          <output data-demo-result="store-count" className="w-6 text-center">{quantity}</output>
          <button type="button" data-demo-action="store-increment" className={demoSecondaryButtonClass}
            aria-label={korean ? '수량 늘리기' : 'Increase quantity'} disabled={quantity === 5}
            onClick={() => cart.setState(state => ({ ...state, quantity: state.quantity + 1 }))}>
            <Plus size={16} aria-hidden />
          </button>
        </div>
      </div>
      <label htmlFor={giftId} className={`${styles.demoRow} min-h-11 cursor-pointer text-sm`}>
        <input id={giftId} type="checkbox" checked={gift} data-demo-input="store-gift"
          onChange={event => {
            const checked = event.currentTarget.checked;
            cart.setState(state => ({ ...state, gift: checked }));
          }} />
        {korean ? '선물 포장 (+$4)' : 'Gift wrapping (+$4)'}
      </label>
      <div className={styles.demoSummary}>
        <button type="button" data-demo-action="store-reset" className="min-h-11 text-xs underline underline-offset-4"
          onClick={() => cart.setState(cart.getInitialState())}>{korean ? '초기화' : 'Reset'}</button>
        <output data-demo-result="store-total" aria-live="polite">{korean ? '합계' : 'Total'} ${total}</output>
      </div>
    </DemoFrame>
  );
}
