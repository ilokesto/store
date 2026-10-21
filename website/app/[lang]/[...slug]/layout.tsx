import { getDocsPageTree } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions, getPackageTabs, packageMetadata } from '@/lib/layout.shared';
import { ReactNode } from 'react';
import { isDevelopmentDocs, isPackageIndex } from '@/lib/publication';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const resolvedParams = await params;
  if (isPackageIndex(resolvedParams.slug)) {
    return children;
  }
  const pkgName = resolvedParams.slug?.[0] || 'store';
  const metadata = packageMetadata[pkgName] || packageMetadata.store;

  return (
    <>
      <style>{`
        html:root {
          --color-fd-primary: ${metadata.cssVarLight};
          --color-fd-primary-foreground: ${metadata.fgVarLight};
        }
        html.dark {
          --color-fd-primary: ${metadata.cssVarDark};
          --color-fd-primary-foreground: ${metadata.fgVarDark};
        }
      `}</style>
      <DocsLayout
        tree={getDocsPageTree(resolvedParams.lang, isDevelopmentDocs(resolvedParams.slug))}
        tabs={getPackageTabs(resolvedParams.lang).map(tab => ({
          ...tab,
          url: tab.url + (isDevelopmentDocs(resolvedParams.slug) ? '/next' : ''),
        }))}
        {...baseOptions()}
      >
        {children}
      </DocsLayout>
    </>
  );
}
