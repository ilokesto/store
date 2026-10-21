import { getPageImage, source } from '@/lib/source';
import {
  DocsBody,
  DocsPage,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { StoreLanding } from '@/components/landings/store-landing';
import { PackageLanding } from '@/components/landings/package-landing';
import { getLandingPackage } from '@/components/landings/landing-packages';
import { StoreLanding as ReleasedStoreLanding } from '@ilokesto/docs-runtime/store-landing';
import { PublicationVersion } from '@/components/landings/publication-version';
import { getDocsChannel, isDevelopmentDocs, isPackageIndex, isPackageName } from '@/lib/publication';
import { rewriteDocsLink } from '@/lib/docs-links';

export default async function Page(props: { params: Promise<{ lang: string; slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  const name = params.slug?.[0];
  const channel = getDocsChannel(params.slug);
  if (!isPackageName(name) || !channel) notFound();
  const lang = params.lang === 'ko' ? 'ko' : 'en';
  if (isPackageIndex(params.slug) && name === 'store') {
    return channel === 'released' ? <ReleasedStoreLanding lang={lang} /> : <StoreLanding lang={lang} />;
  }
  const landing = isPackageIndex(params.slug) ? getLandingPackage(name) : undefined;
  if (landing) {
    return <PackageLanding info={landing} lang={params.lang === 'ko' ? 'ko' : 'en'} />;
  }

  const MDX = page.data.body;
  const RelativeLink = createRelativeLink(source, page);
  const relativeSlug = channel === 'next' ? page.slugs.slice(2) : page.slugs.slice(1);
  const releasedPage = source.getPage([name, ...relativeSlug], lang);
  const nextPage = source.getPage([name, 'next', ...relativeSlug], lang);

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ style: 'clerk' }}
      tableOfContentPopover={{ style: 'clerk' }}
    >
      <PublicationVersion name={name} lang={lang} channel={channel}
        releasedHref={releasedPage?.url ?? `/${lang}/${name}`}
        nextHref={nextPage?.url ?? `/${lang}/${name}/next`} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: ({ href, ...props }) => <RelativeLink {...props}
              href={rewriteDocsLink(href, isDevelopmentDocs(params.slug), 'store')} />,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ lang: string; slug?: string[] }> }): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    robots: isDevelopmentDocs(params.slug) ? { index: false, follow: false } : undefined,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
