import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicPackageNames, rewriteDocsLink, rewriteMarkdownLinks } from '../lib/docs-links.ts';

const compilerRoot = await realpath(new URL('../node_modules/fumadocs-mdx', import.meta.url));
const require = createRequire(`${compilerRoot}/package.json`);
const { evaluate } = await import(pathToFileURL(require.resolve('@mdx-js/mdx')).href);

for (const locale of ['en', 'ko']) {
  test(`Modal ${locale} corpus: rendered and Markdown Overlay links -> retained locale and next channel`, async () => {
    const bytes = await readFile(new URL(`./fixtures/modal-core-concepts.${locale}.mdx`, import.meta.url), 'utf8');
    const document = bytes.replace(/^---\n[\s\S]*?\n---\n/, '');
    const module = await evaluate(document, { ...runtime, development: false });
    const components = { a: ({ href, ...props }) => createElement('a', {
      ...props, href: rewriteDocsLink(href, true, 'modal'),
    }) };

    const html = renderToStaticMarkup(createElement(module.default, { components }));
    const markdown = rewriteMarkdownLinks(document, true, 'modal');

    const expected = `https://ilokesto.ayden94.com/${locale}/overlay/next`;
    assert.ok(html.includes(`href="${expected}"`));
    assert.ok(markdown.includes(`](${expected})`));
    assert.ok(!html.includes(`href="/${locale}/overlay"`));
    assert.equal(rewriteDocsLink(`/${locale}/modal/core-concepts`, true, 'modal'), `/${locale}/modal/next/core-concepts`);
  });
}

test('complete classification: every public foreign package -> rendered and Markdown destinations agree', async () => {
  for (const owner of publicPackageNames) {
    for (const locale of ['en', 'ko']) {
      const document = publicPackageNames.map(name => `[${name}](/${locale}/${name}/next/core-concepts)`).join('\n\n');
      const module = await evaluate(document, { ...runtime, development: false });
      const html = renderToStaticMarkup(createElement(module.default, {
        components: { a: ({ href, ...props }) => createElement('a', { ...props, href: rewriteDocsLink(href, true, owner) }) },
      }));
      const markdown = rewriteMarkdownLinks(document, true, owner);
      for (const name of publicPackageNames) {
        const href = `${owner === name ? '' : 'https://ilokesto.ayden94.com'}/${locale}/${name}/next/core-concepts`;
        assert.ok(html.includes(`href="${href}"`));
        assert.ok(markdown.includes(`](${href})`));
      }
    }
  }
});
