import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const action = (page, name) => page.locator(`[data-demo-action="${name}"]`);
const result = (page, name) => page.locator(`[data-demo-result="${name}"]`);

export async function stableDemoAction(page, perform) {
  const bounds = () => page.locator('[data-demo-code]').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
  const before = await bounds();
  await perform();
  const after = await bounds();
  for (const key of Object.keys(before)) {
    assert.ok(Math.abs(before[key] - after[key]) <= 1, `Code panel ${key} shifted: ${before[key]} -> ${after[key]}`);
  }
}

export const currentDemoBehaviors = {
  async store(page) {
    await expect(result(page, 'store-count')).toHaveText('1');
    await expect(action(page, 'store-decrement')).toBeDisabled();
    await stableDemoAction(page, async () => {
      await action(page, 'store-increment').click();
      await expect(result(page, 'store-total')).toContainText('$48');
    });
    await stableDemoAction(page, async () => {
      await page.locator('[data-demo-input="store-gift"]').check();
      await expect(result(page, 'store-total')).toContainText('$52');
    });
    await action(page, 'store-decrement').click();
    await expect(result(page, 'store-total')).toContainText('$28');
    await stableDemoAction(page, async () => {
      await action(page, 'store-reset').click();
      await expect(result(page, 'store-total')).toContainText('$24');
    });
  },

  async state(page) {
    const title = page.locator('[data-demo-input="state-title"]');
    const preview = result(page, 'state-preview');
    const initialTitle = await title.inputValue();
    await expect(action(page, 'state-undo')).toBeDisabled();
    await stableDemoAction(page, async () => {
      await title.fill('새로운작업실카드제목을끝까지입력해도레이아웃은그대로');
      await expect(preview).toContainText(await title.inputValue());
    });
    await stableDemoAction(page, async () => {
      await page.locator('[data-demo-action="state-tone"][data-tone="graphite"]').click();
      await expect(preview).toHaveAttribute('data-tone', 'graphite');
    });
    await stableDemoAction(page, async () => {
      await action(page, 'state-undo').click();
      await expect(preview).toHaveAttribute('data-tone', 'paper');
    });
    await action(page, 'state-redo').click();
    await expect(preview).toHaveAttribute('data-tone', 'graphite');
    await stableDemoAction(page, async () => {
      await action(page, 'state-reset').click();
      await expect(title).toHaveValue(initialTitle);
      await expect(preview).toHaveAttribute('data-tone', 'paper');
    });
  },

  async form(page) {
    const email = page.locator('[data-demo-input="form-email"]');
    const role = page.locator('[data-demo-input="form-role"]');
    const submit = action(page, 'form-submit');
    const buttonPosition = () => submit.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + scrollX, y: rect.y + scrollY };
    });
    const before = await buttonPosition();
    await stableDemoAction(page, async () => {
      await email.fill('invalid');
      await submit.click();
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(result(page, 'form-error')).not.toBeEmpty();
      await expect(result(page, 'form-success')).toBeEmpty();
    });
    assert.deepEqual(await buttonPosition(), before, 'Validation must not move the submit button');
    await stableDemoAction(page, async () => {
      await email.fill('reader@example.com');
      await role.selectOption('admin');
      await submit.click();
      await expect(result(page, 'form-success')).not.toBeEmpty();
      await expect(result(page, 'form-error')).toBeEmpty();
    });
    await stableDemoAction(page, async () => {
      await action(page, 'form-reset').click();
      await expect(email).toHaveValue('');
      await expect(role).toHaveValue('member');
      await expect(result(page, 'form-success')).toBeEmpty();
    });
  },

  async overlay(page) {
    const initial = await result(page, 'overlay').textContent();
    await stableDemoAction(page, async () => {
      await action(page, 'overlay-open').click();
      await expect(result(page, 'overlay-card')).toBeVisible();
      await expect(action(page, 'overlay-open')).toHaveAttribute('aria-disabled', 'true');
    });
    await stableDemoAction(page, async () => {
      await action(page, 'overlay-select-mina').click();
      await expect(result(page, 'overlay-card')).toHaveCount(0);
      await expect(result(page, 'overlay')).not.toHaveText(initial);
      await expect(action(page, 'overlay-open')).toBeFocused();
    });
    await action(page, 'overlay-open').click();
    await stableDemoAction(page, async () => {
      await action(page, 'overlay-reset').click();
      await expect(result(page, 'overlay-card')).toHaveCount(0);
      await expect(result(page, 'overlay')).toHaveText(initial);
    });
  },

  async modal(page) {
    const open = action(page, 'modal-open');
    const initial = await result(page, 'modal-document').textContent();
    await stableDemoAction(page, async () => {
      await open.click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });
    await stableDemoAction(page, async () => {
      await action(page, 'modal-confirm').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(result(page, 'modal-document')).not.toHaveText(initial);
      await expect(open).toHaveAttribute('aria-disabled', 'true');
      await expect(open).toBeFocused();
    });
    await action(page, 'modal-reset').click();
    await open.click();
    await action(page, 'modal-cancel').click();
    await expect(result(page, 'modal-document')).toHaveText(initial);
    await open.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(result(page, 'modal-document')).toHaveText(initial);
    await expect(open).toBeFocused();
  },

  async toast(page) {
    for (const outcome of ['success', 'error']) {
      await stableDemoAction(page, async () => {
        await action(page, `toast-${outcome}`).click();
        await expect(page.locator(`[data-demo-toast="${outcome}"]`)).toBeVisible();
      });
    }
    await stableDemoAction(page, async () => {
      await action(page, 'toast-clear').click();
      await expect(page.locator('[data-demo-toast]')).toHaveCount(0);
    });
  },
  async fetcher(page) {
    const demo = page.locator('[data-demo="fetcher"]');
    const output = page.locator('[data-result="fetcher-output"]');
    for (const outcome of ['success', 'error']) {
      await stableDemoAction(page, async () => {
        const response = page.waitForResponse(response => response.url().includes(`outcome=${outcome}`));
        await demo.locator(`[data-action="fetch-${outcome}"]`).click();
        await response;
        await expect(output).toHaveAttribute('data-state', outcome);
        await expect(output).toContainText(outcome === 'success' ? 'demo-user-42' : 'DEMO_UNAVAILABLE');
      });
    }
    await stableDemoAction(page, async () => {
      await demo.locator('[data-action="reset"]').click();
      await expect(output).toHaveAttribute('data-state', 'idle');
    });
  },
  async utilinent(page) {
    const demo = page.locator('[data-demo="utilinent"]');
    const branch = demo.locator('[data-result="utilinent-branch"]');
    await stableDemoAction(page, async () => {
      await demo.locator('[data-action="toggle-list"]').click();
      await expect(branch).toHaveAttribute('data-state', 'hidden');
    });
    await demo.locator('[data-action="toggle-list"]').click();
    await stableDemoAction(page, async () => {
      await demo.locator('[data-action="remove-item"]').first().click();
      await demo.locator('[data-action="remove-item"]').first().click();
      await expect(branch).toHaveAttribute('data-state', 'empty');
    });
    await stableDemoAction(page, async () => {
      for (let index = 0; index < 3; index++) await demo.locator('[data-action="add-item"]').click();
      await expect(demo.locator('[data-action="add-item"]')).toBeDisabled();
      await expect(demo.locator('[data-action="remove-item"]')).toHaveCount(3);
    });
    await stableDemoAction(page, async () => {
      await demo.locator('[data-action="reset"]').click();
      await expect(demo.locator('[data-action="remove-item"]')).toHaveCount(2);
    });
  },
};
