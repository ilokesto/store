import { DocsProvider } from '@/components/docs-provider';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const resolvedParams = await params;

  return (
    <DocsProvider lang={resolvedParams.lang}>
      {children}
    </DocsProvider>
  );
}
