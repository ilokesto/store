import { getPageImage, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from '@takumi-rs/image-response';
import { generate as DefaultImage } from 'fumadocs-ui/og/takumi';
import { isDevelopmentDocs } from '@/lib/publication';

export const revalidate = false;

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  if (slug.at(-1) !== 'image.webp') notFound();
  const [lang, ...segments] = slug;
  if (lang !== 'en' && lang !== 'ko') notFound();
  const pageSlugs = segments.slice(0, -1);
  const page = source.getPage(pageSlugs, lang);
  if (!page) notFound();

  const response = new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site="ilokesto" />,
    {
      width: 1200,
      height: 630,
      format: 'webp',
    },
  );
  if (isDevelopmentDocs(page.slugs)) response.headers.set('X-Robots-Tag', 'noindex');
  return response;
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
