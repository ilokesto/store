import { getLLMText, getPageMarkdownUrl, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { isDevelopmentDocs } from '@/lib/publication';

export const revalidate = false;

export async function GET(_req: Request, { params }: RouteContext<'/llms.mdx/docs/[[...slug]]'>) {
  const { slug } = await params;
  if (!slug || slug.at(-1) !== 'content.md') notFound();
  const [lang, ...segments] = slug;
  if (lang !== 'en' && lang !== 'ko') notFound();
  const pageSlugs = segments.slice(0, -1);
  const page = source.getPage(pageSlugs, lang);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
      ...(isDevelopmentDocs(page.slugs) ? { 'X-Robots-Tag': 'noindex' } : {}),
    },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageMarkdownUrl(page).segments,
  }));
}
