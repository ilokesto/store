import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect } from '@playwright/test';
import publication from '../../docs-publication/active.json' with { type: 'json' };
import { currentDemoBehaviors, stableDemoAction } from './current-demo-behaviors.mjs';
import { createDocsSite } from './http-fixture.mjs';

const site = createDocsSite();
const packages = Object.keys(publication.packages);

for (const lang of ['en', 'ko']) for (const width of [390, 1440]) {
  for (const name of packages) {
    const channels = publication.packages[name].revision > 1 ? ['next', 'released'] : ['next'];
    for (const channel of channels) {
      test(`${lang}/${name}/${channel} at ${width}px keeps short code and stable controls`, { timeout: 30_000 }, async () => {
        const page = await site.browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${site.origin}/${lang}/${name}${channel === 'next' ? '/next' : ''}`);
          await expect(page.locator('[data-demo-code] .line span').first()).toBeVisible();
          const geometry = await page.locator('[data-demo-code]').evaluate(element => {
            const pre = element.querySelector('pre');
            const colors = new Set([...element.querySelectorAll('.line span')].map(token => getComputedStyle(token).color));
            return {
              lines: element.querySelectorAll('.line').length,
              height: pre.clientHeight, scrollHeight: pre.scrollHeight,
              width: pre.clientWidth, scrollWidth: pre.scrollWidth,
              panelHeight: element.getBoundingClientRect().height,
              pageWidth: document.documentElement.scrollWidth,
              colors: colors.size,
            };
          });
          assert.ok(geometry.lines > 0 && geometry.lines <= 12, `${geometry.lines} code lines`);
          assert.ok(geometry.colors >= 3, 'Code must have distinct syntax token colors');
          assert.ok(geometry.scrollHeight <= geometry.height + 1, 'Code must not scroll vertically');
          assert.ok(geometry.scrollWidth <= geometry.width + 1, 'Core code must fit horizontally');
          assert.ok(geometry.panelHeight <= 500, 'Core code must fit one viewport');
          assert.ok(geometry.pageWidth <= width, 'The page must not scroll horizontally');
          if (name === 'form') {
            const role = await page.locator('[data-demo-input="form-role"]').evaluate(select => {
              const style = getComputedStyle(select);
              const context = document.createElement('canvas').getContext('2d');
              context.font = style.font;
              return {
                textWidth: context.measureText(select.selectedOptions[0].textContent).width,
                available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24,
              };
            });
            assert.ok(role.textWidth <= role.available, 'Selected role must fit beside the native select arrow');
          }
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.origin });
          const lines = await page.locator('[data-demo-code] .line').allTextContents();
          await stableDemoAction(page, async () => {
            await page.locator('[data-demo-code] button').click();
            assert.equal(await page.evaluate(() => navigator.clipboard.readText()), lines.join('\n'));
          });
          await currentDemoBehaviors[name](page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }
  }
}
