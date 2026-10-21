'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isDevelopmentDocs } from '@/lib/publication';

export function DocsProvider({ lang, children }: {
  readonly lang: string;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const next = isDevelopmentDocs(pathname.split('/').filter(Boolean).slice(1));
  return (
    <RootProvider
      search={{ options: { type: 'fetch', api: next ? '/api/search/next' : '/api/search' } }}
      i18n={{
        locale: lang,
        locales: lang === 'ko'
          ? [{ locale: 'en', name: '영어' }, { locale: 'ko', name: '한국어' }]
          : [{ locale: 'en', name: 'English' }, { locale: 'ko', name: 'Korean' }],
        translations: lang === 'ko'
          ? {
              search: '검색', searchNoResult: '결과 없음', toc: '목차',
              tocNoHeadings: '제목 없음', lastUpdate: '마지막 업데이트',
              chooseLanguage: '언어 선택', nextPage: '다음', previousPage: '이전',
            }
          : undefined,
      }}
    >
      {children}
    </RootProvider>
  );
}
