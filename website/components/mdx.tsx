import { cn } from '@/lib/cn';
import { PackageDemo } from './demos/package-demo';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import type { ComponentPropsWithoutRef } from 'react';

function Code({ className, ...props }: ComponentPropsWithoutRef<'code'>) {
  if (className?.includes('language-')) {
    return <code className={className} {...props} />;
  }

  return (
    <code
      className={cn('font-medium text-[var(--color-fd-primary)]', className)}
      {...props}
    />
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    code: Code,
    PackageDemo,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
