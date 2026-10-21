import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect } from '@playwright/test';
import publication from '../../docs-publication/active.json' with { type: 'json' };
import { createDocsSite } from './http-fixture.mjs';

const site = createDocsSite();
const request = site.request;

test('released discovery excludes every development package path', async () => {
  for (const lang of ['en', 'ko']) for (const name of Object.keys(publication.packages)) {
    const results = await (await request(`/api/search?query=${name}&locale=${lang}`)).json();
    assert.ok(results.length > 0, name);
    assert.ok(results.every(result => !/^\/(?:en|ko)\/[^/]+\/next(?:\/|#|$)/.test(result.url)), name);
    const development = await (await request(`/api/search/next?query=${name}&locale=${lang}`)).json();
    assert.ok(development.length > 0, name);
    assert.ok(development.every(result => /^\/(?:en|ko)\/[^/]+\/next(?:\/|#|$)/.test(result.url)));
  }
  for (const pathname of ['/llms.txt', '/llms-full.txt']) {
    const response = await request(pathname);
    assert.equal(response.status, 200);
    assert.equal(response.url, site.origin + pathname);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    const text = await response.text();
    assert.doesNotMatch(text, /\/(?:en|ko)\/[^/\s]+\/next(?:\/|\))/);
    for (const name of Object.keys(publication.packages)) assert.ok(text.includes(`/en/${name}`));
  }
  const nextText = await request('/llms-next.txt');
  assert.equal(nextText.headers.get('x-robots-tag'), 'noindex');
  assert.match(await nextText.text(), /\/en\/store\/next/);
});

for (const lang of ['en', 'ko']) for (const name of Object.keys(publication.packages)) {
  test(`${lang}/${name} preserves channel across version, language and search navigation`, { timeout: 30_000 }, async () => {
    const page = await site.browser.newPage();
    try {
      await page.goto(`${site.origin}/${lang}/${name}`);
      await expect(page.locator('[data-docs-version]')).toHaveAttribute('data-docs-version', publication.packages[name].version);
      await Promise.all([
        page.waitForURL(`${site.origin}/${lang}/${name}/next`),
        page.locator('[data-doc-channel-link="next"]').click(),
      ]);
      await expect(page.locator('[data-landing]')).toHaveAttribute('data-runtime-version', 'workspace');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      const other = lang === 'en' ? 'ko' : 'en';
      await Promise.all([
        page.waitForURL(`${site.origin}/${other}/${name}/next`),
        page.locator(`header a[hreflang="${other}"]`).click(),
      ]);
      await Promise.all([
        page.waitForURL(`${site.origin}/${other}/${name}/next/quick-start`),
        page.locator(`header a[href="/${other}/${name}/next/quick-start"]`).click(),
      ]);
      const nextSearch = page.waitForRequest(req => new URL(req.url()).pathname === '/api/search/next');
      await page.keyboard.press('ControlOrMeta+k');
      await page.getByRole('dialog').getByRole('textbox').fill(name);
      await nextSearch;
      await page.keyboard.press('Escape');
      const releasedSearch = page.waitForRequest(req => new URL(req.url()).pathname === '/api/search');
      await Promise.all([
        page.waitForURL(`${site.origin}/${other}/${name}/quick-start`),
        page.locator('[data-doc-channel-link="released"]').click(),
      ]);
      await expect(page.locator('[data-docs-version]')).toHaveAttribute('data-docs-version', publication.packages[name].version);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await page.keyboard.press('ControlOrMeta+k');
      await page.getByRole('dialog').getByRole('textbox').fill('store');
      await releasedSearch;
    } finally { await page.close(); }
  });
}

test('Markdown and OG preserve each package, locale and channel without redirects', { timeout: 60_000 }, async () => {
  for (const lang of ['en', 'ko']) for (const name of Object.keys(publication.packages)) {
    for (const suffix of ['', '/next']) {
      const route = `${lang}/${name}${suffix}`;
      const pathname = `/llms.mdx/docs/${route}/content.md`;
      const markdown = await request(pathname);
      assert.equal(markdown.status, 200, pathname);
      assert.equal(markdown.url, site.origin + pathname);
      assert.match(markdown.headers.get('content-type'), /text\/markdown/);
      assert.equal(markdown.headers.get('x-robots-tag'), suffix ? 'noindex' : null);
      assert.ok((await markdown.text()).includes(`(/${route})`));
      const image = await request(`/og/docs/${route}/image.webp`);
      assert.equal(image.status, 200, route);
      assert.equal(image.headers.get('content-type'), 'image/webp');
      assert.equal(image.headers.get('x-robots-tag'), suffix ? 'noindex' : null);
      assert.ok((await image.arrayBuffer()).byteLength > 0);
    }
  }
});
