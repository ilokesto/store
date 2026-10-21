import Link from 'next/link';
import { publishedPackages, type DocsChannel, type PackageName } from '@/lib/publication';
import styles from './store-landing.module.css';

export function PublicationVersion({ name, lang, channel, releasedHref, nextHref, compact = false }: {
  readonly name: PackageName;
  readonly lang: 'en' | 'ko';
  readonly channel: DocsChannel;
  readonly releasedHref?: string;
  readonly nextHref?: string;
  readonly compact?: boolean;
}) {
  const release = publishedPackages[name];
  return (
    <aside className={styles.storeVersion} data-docs-channel={channel}
      data-docs-version={channel === 'released' ? release.version : 'next'}>
      <nav aria-label={`${name} ${lang === 'ko' ? '문서 버전' : 'documentation version'}`}>
        <Link href={releasedHref ?? `/${lang}/${name}`} data-doc-channel-link="released"
          aria-current={channel === 'released' ? 'page' : undefined}>
          v{release.version} · {lang === 'ko' ? '공개 문서' : 'Released'}
        </Link>
        <Link href={nextHref ?? `/${lang}/${name}/next`} data-doc-channel-link="next"
          aria-current={channel === 'next' ? 'page' : undefined}>
          next · {compact
            ? (lang === 'ko' ? '미배포 문서' : 'Unreleased')
            : (lang === 'ko' ? '개발 문서' : 'Development')}
        </Link>
      </nav>
      {!compact && (channel === 'next'
        ? <p role="note">{lang === 'ko' ? 'main 기준 · 미배포 변경사항이 포함될 수 있습니다.' : 'Tracks main · may include unpublished changes.'}</p>
        : <p>{lang === 'ko' ? `npm ${release.version} 기준 문서와 실행 예제입니다.` : `Documentation and examples for npm ${release.version}.`}</p>)}
    </aside>
  );
}
