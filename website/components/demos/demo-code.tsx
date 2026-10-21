'use client';

import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import styles from '../landings/store-landing.module.css';

function CodePre({ children }: { readonly children?: ReactNode }) {
  return <pre tabIndex={0} className={styles.sceneCode}>{children}</pre>;
}

const industrialTheme = {
  name: 'ilokesto-workshop',
  type: 'dark' as const,
  colors: { 'editor.background': '#202622', 'editor.foreground': '#edf0e8' },
  settings: [
    { scope: ['comment'], settings: { foreground: '#b2b8a9' } },
    { scope: ['keyword', 'storage'], settings: { foreground: '#dfb682' } },
    { scope: ['string', 'constant'], settings: { foreground: '#ead7a2' } },
    { scope: ['entity.name.function', 'entity.name.type'], settings: { foreground: '#edf0e8' } },
    { scope: ['punctuation'], settings: { foreground: '#b2b8a9' } },
  ],
};

const highlightOptions = {
  themes: { light: industrialTheme, dark: industrialTheme },
  components: { pre: CodePre },
} as const;

export function DemoCode({ code, name, lang }: {
  readonly code: string;
  readonly name: string;
  readonly lang: 'en' | 'ko';
}) {
  const pathname = usePathname();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const korean = lang === 'ko';
  const documentation = `${pathname.replace(/\/$/, '')}/quick-start`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setCopyState('failed');
    }
  };

  return (
    <div className={styles.codePanel} data-demo-code={name}>
      <div className={styles.codeHeader}>
        <span>{name}.tsx</span>
        <span>{korean ? '핵심 코드' : 'Core snippet'}</span>
        <button type="button" onClick={() => void copy()} className={styles.copyCode}
          aria-label={korean ? '예제 코드 복사' : 'Copy example code'}>
          {copyState === 'copied' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          <span aria-live="polite">
            {copyState === 'copied' ? (korean ? '복사됨' : 'Copied')
              : copyState === 'failed' ? (korean ? '다시 복사' : 'Retry copy')
                : (korean ? '복사' : 'Copy')}
          </span>
        </button>
      </div>
      <DynamicCodeBlock lang="tsx" code={code} options={highlightOptions} />
      <div className={styles.codeFooter}>
        <span>{korean ? '설정과 import는 문서에서' : 'Setup and imports in the docs'}</span>
        <Link href={documentation}>{korean ? '전체 사용법' : 'Full guide'} <span aria-hidden>&#8599;</span></Link>
      </div>
    </div>
  );
}
