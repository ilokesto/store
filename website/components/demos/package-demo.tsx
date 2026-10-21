'use client';

import dynamic from 'next/dynamic';
import { useParams, usePathname } from 'next/navigation';
import { isDevelopmentDocs, publishedPackages } from '@/lib/publication';
import type { DemoProps } from './demo-frame';

function LoadingDemo() {
  const { lang } = useParams<{ lang: string }>();
  return (
    <p role="status" className="not-prose my-8 rounded-2xl border border-fd-border bg-fd-card p-6 text-sm text-fd-muted-foreground">
      {lang === 'ko' ? '체험 예제를 불러오는 중입니다…' : 'Loading the interactive example…'}
    </p>
  );
}

const demos = {
  store: dynamic(() => import('./store-demo').then((module) => module.StoreDemo), { ssr: false, loading: LoadingDemo }),
};

const releasedDemos = {
  store: dynamic(() => import('@ilokesto/docs-runtime/store-demo').then(module => module.StoreDemo), { ssr: false, loading: LoadingDemo }),
};

export function PackageDemo({ name, lang }: DemoProps & { readonly name: keyof typeof demos }) {
  const pathname = usePathname();
  const development = isDevelopmentDocs(pathname.split('/').filter(Boolean).slice(1));
  const Demo = development ? demos[name] : releasedDemos[name];
  return (
    <div data-demo-slot={name} data-demo-runtime={development ? 'workspace' : publishedPackages[name].version}>
      <Demo lang={lang} />
      <noscript>
        {lang === 'ko'
          ? '직접 체험하려면 JavaScript를 켜세요. 아래 예제 코드와 빠른 시작 문서는 그대로 읽을 수 있습니다.'
          : 'Enable JavaScript to try the demo. The example code and quick-start documentation below remain available.'}
      </noscript>
    </div>
  );
}
