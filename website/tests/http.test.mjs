import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '@playwright/test';
import publication from '../../docs-publication/active.json' with { type: 'json' };
import { demoBehaviors } from './demo-behaviors.mjs';
import { currentDemoBehaviors } from './current-demo-behaviors.mjs';
import { createDocsSite } from './http-fixture.mjs';

const site = createDocsSite();
const request = site.request;
const packages = Object.keys(publication.packages);

for (const lang of ['en', 'ko']) {
  test(`${lang} homepage switches its shared palette in dark mode`, async () => {
    const page = await site.browser.newPage({ colorScheme: 'light' });
    try {
      await page.goto(`${site.origin}/${lang}`);
      const content = page.locator('main').last();
      const background = await content.evaluate(element => getComputedStyle(element).backgroundColor);
      await page.getByRole('button', { name: 'Toggle Theme' }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect(content).not.toHaveCSS('background-color', background);
    } finally { await page.close(); }
  });
  for (const name of packages) for (const channel of ['released', 'next']) {
    test(`${lang}/${name}/${channel} runs its real interactive example`, { timeout: 30_000 }, async () => {
      const page = await site.browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${site.origin}/${lang}/${name}${channel === 'next' ? '/next' : ''}`);
        await expect(page.locator(`[data-landing="${name}"]`)).toBeVisible();
        await expect(page.locator('#nd-sidebar')).toHaveCount(0);
        await expect(page.locator(`[data-demo="${name}"]`)).toBeVisible();
        await expect(page.locator('[data-landing]')).toHaveAttribute(
          'data-runtime-version', channel === 'next' ? 'workspace' : publication.packages[name].version,
        );
        // A new npm version restarts revisions at 1 without reverting its demo.
        const revised = channel === 'next'
          || publication.packages[name].docsCommit !== 'fc8bd4755137b75767284dbe84a0774185dfbdde';
        if (revised) await expect(page.locator('[data-demo-code] .line span').first()).toBeVisible();
        await (revised ? currentDemoBehaviors : demoBehaviors)[name](page);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
}

test('Store site: Fetcher demo API -> remains outside this repository', async () => {
  const response = await request('/api/demo/fetcher?outcome=success');
  assert.equal(response.status, 404);
});

test('package landings preserve illustrations, locales and documentation routes', { timeout: 60_000 }, async () => {
  const page = await site.browser.newPage();
  try {
    for (const name of packages) {
      const illustration = await request(`/illustrations/${name}-workshop.webp`);
      assert.equal(illustration.status, 200, name);
      assert.match(illustration.headers.get('content-type'), /image\/webp/);
      assert.equal(illustration.redirected, false);
      await page.goto(`${site.origin}/en/${name}`);
      await expect(page.locator('#nd-sidebar')).toHaveCount(0);
      await Promise.all([
        page.waitForURL(`${site.origin}/ko/${name}`),
        page.locator('header a[hreflang="ko"]').click(),
      ]);
      await expect(page.locator(`[data-demo="${name}"]`)).toBeVisible();
      await Promise.all([
        page.waitForURL(`${site.origin}/ko/${name}/quick-start`),
        page.locator(`header a[href="/ko/${name}/quick-start"]`).click(),
      ]);
      await expect(page.locator('#nd-sidebar')).toBeVisible();
    }
  } finally { await page.close(); }
});

for (const suffix of ['', '/next']) {
  test(`Store${suffix} releases its interactive demo on client navigation`, async () => {
    const page = await site.browser.newPage();
    try {
      await page.goto(`${site.origin}/en/store${suffix}`);
      await page.locator('[data-demo-action="store-increment"]').click();
      await expect(page.locator('[data-demo-result="store-count"]')).toHaveText('2');
      await Promise.all([
        page.waitForURL(`${site.origin}/en/store${suffix}/quick-start`),
        page.locator(`header a[href="/en/store${suffix}/quick-start"]`).click(),
      ]);
      await expect(page.locator('[data-demo="store"]')).toHaveCount(0);
      await page.goto(`${site.origin}/en/store${suffix}`);
      await expect(page.locator('[data-demo-result="store-count"]')).toHaveText('1');
    } finally { await page.close(); }
  });
}

test('every released and main bilingual page and internal link is served', { timeout: 60_000 }, async () => {
  const routes = [];
  for (const name of packages) for (const channel of ['released', 'next']) {
    const dir = channel === 'released'
      ? `../../${publication.packages[name].snapshot}/revision/docs/`
      : '../../docs/';
    const files = await readdir(new URL(dir, import.meta.url), { recursive: true });
    for (const file of files.filter(file => file.endsWith('.mdx'))) {
      const lang = file.endsWith('.ko.mdx') ? 'ko' : 'en';
      const slug = file.replace(/(?:\.ko)?\.mdx$/, '').replace(/(^|\/)index$/, '');
      routes.push(`/${lang}/${name}${channel === 'next' ? '/next' : ''}/${slug}`.replace(/\/$/, ''));
    }
  }
  for (let offset = 0; offset < routes.length; offset += 12) {
    await Promise.all(routes.slice(offset, offset + 12).map(async route => {
      const response = await request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      const html = await response.text();
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        const target = new URL(href.replaceAll('&amp;', '&'), `${site.origin}${route}`);
        if (target.origin !== site.origin || !/^\/(?:en|ko)\//.test(target.pathname)) continue;
        assert.ok(routes.includes(target.pathname.replace(/\/$/, '')), `${route} links to missing ${target.pathname}`);
      }
    }));
  }
});

test('home navigation preserves packages and search stays localized', async () => {
  for (const lang of ['en', 'ko']) {
    const home = await (await request(`/${lang}`)).text();
    for (const name of packages) {
      assert.ok(home.includes(`href="/${lang}/${name}"`), `${lang}/${name}`);
      assert.ok(home.includes(`href="/${lang}/${name}/quick-start"`), `${lang}/${name}/quick-start`);
      const intro = await (await request(`/${lang}/${name}`)).text();
      assert.ok(intro.includes(`href="/${lang}/${name}/quick-start"`));
      const quickStart = await request(`/${lang}/${name}/quick-start`);
      assert.equal(quickStart.status, 200);
      await quickStart.arrayBuffer();
    }
    const results = await (await request(`/api/search?query=store&locale=${lang}`)).json();
    assert.ok(results.length > 0);
    assert.ok(results.every(result => result.url.startsWith(`/${lang}/`)
      && !/^\/(?:en|ko)\/[^/]+\/next(?:\/|#|$)/.test(result.url)));
  }
});
