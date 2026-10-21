import { developmentSource } from '@/lib/source';
import { flexsearchFromSource } from 'fumadocs-core/search/flexsearch';

const search = flexsearchFromSource(developmentSource, { localeMap: { ko: 'cjk' } });

export async function GET(request: Request) {
  const response = await search.GET(request);
  response.headers.set('X-Robots-Tag', 'noindex');
  return response;
}
