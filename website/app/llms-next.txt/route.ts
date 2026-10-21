import { getLLMText, developmentSource } from '@/lib/source';

export async function GET() {
  const pages = await Promise.all(developmentSource.getPages().map(getLLMText));
  return new Response(pages.join('\n\n'), {
    headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' },
  });
}
