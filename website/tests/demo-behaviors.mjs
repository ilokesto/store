import { expect } from '@playwright/test';

const action = (page, name) => page.locator(`[data-demo-action="${name}"]`);
const result = (page, name) => page.locator(`[data-demo-result="${name}"]`);

export const demoBehaviors = {
  async store(page) {
    await expect(result(page, 'store-count')).toHaveText('0');
    await action(page, 'store-decrement').click();
    await expect(result(page, 'store-count')).toHaveText('-1');
    await action(page, 'store-increment').click();
    await action(page, 'store-increment').click();
    await expect(result(page, 'store-count')).toHaveText('1');
    await action(page, 'store-reset').click();
    await expect(result(page, 'store-count')).toHaveText('0');
  },

  async state(page) {
    const initialParity = await result(page, 'state-parity').textContent();
    await expect(result(page, 'state-count')).toHaveText('0');
    await action(page, 'state-increment').click();
    await expect(result(page, 'state-count')).toHaveText('1');
    await expect(result(page, 'state-parity')).not.toHaveText(initialParity);
    await action(page, 'state-reset').click();
    await expect(result(page, 'state-count')).toHaveText('0');
    await expect(result(page, 'state-parity')).toHaveText(initialParity);
  },

  async form(page) {
    const email = page.locator('[data-demo-input="form-email"]');
    await email.fill('invalid');
    await action(page, 'form-submit').click();
    await expect(result(page, 'form-error')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(result(page, 'form-success')).toBeEmpty();
    await email.fill('reader@example.com');
    await action(page, 'form-submit').click();
    await expect(result(page, 'form-success')).toContainText('reader@example.com');
    await expect(result(page, 'form-error')).toHaveCount(0);
    await action(page, 'form-reset').click();
    await expect(email).toHaveValue('');
    await expect(result(page, 'form-success')).toBeEmpty();
    await expect(result(page, 'form-error')).toHaveCount(0);
  },

  async overlay(page) {
    const initial = await result(page, 'overlay').textContent();
    await action(page, 'overlay-open').click();
    await expect(result(page, 'overlay-card')).toBeVisible();
    await expect(action(page, 'overlay-open')).toBeDisabled();
    await action(page, 'overlay-close').click();
    await expect(result(page, 'overlay-card')).toHaveCount(0);
    await expect(action(page, 'overlay-open')).toBeEnabled();
    await expect(result(page, 'overlay')).not.toHaveText(initial);
    await action(page, 'overlay-open').click();
    await action(page, 'overlay-reset').click();
    await expect(result(page, 'overlay-card')).toHaveCount(0);
    await expect(result(page, 'overlay')).toHaveText(initial);
  },

  async modal(page) {
    const open = action(page, 'modal-open');
    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await action(page, 'modal-confirm').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(open).toBeEnabled();
    await expect(open).toHaveAttribute('aria-disabled', 'false');
    const confirmed = await result(page, 'modal').textContent();
    await expect(open).toBeFocused();
    await open.click();
    await action(page, 'modal-cancel').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(open).toBeEnabled();
    await expect(open).toHaveAttribute('aria-disabled', 'false');
    await expect(result(page, 'modal')).not.toHaveText(confirmed);
    const cancelled = await result(page, 'modal').textContent();
    await open.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(result(page, 'modal')).not.toHaveText(cancelled);
    await expect(open).toBeFocused();
    await action(page, 'modal-reset').click();
  },

  async toast(page) {
    await action(page, 'toast-success').click();
    await expect(page.locator('[data-demo-toast="success"]')).toBeVisible();
    await action(page, 'toast-error').click();
    await expect(page.locator('[data-demo-toast="error"]')).toBeVisible();
    await action(page, 'toast-clear').click();
    await expect(page.locator('[data-demo-toast]')).toHaveCount(0);
  },

  async fetcher(page) {
    const output = page.locator('[data-result="fetcher-output"]');
    const demo = page.locator('[data-demo="fetcher"]');
    const success = page.waitForResponse(response =>
      response.url().includes('/api/demo/fetcher?outcome=success') && response.status() === 200);
    await demo.locator('[data-action="fetch-success"]').click();
    await success;
    await expect(output).toHaveAttribute('data-state', 'success');
    await expect(output).toContainText('demo-user-42');
    const failure = page.waitForResponse(response =>
      response.url().includes('/api/demo/fetcher?outcome=error') && response.status() === 503);
    await demo.locator('[data-action="fetch-error"]').click();
    await failure;
    await expect(output).toHaveAttribute('data-state', 'error');
    await expect(output).toContainText('503');
    await expect(output).toContainText('DEMO_UNAVAILABLE');
    await demo.locator('[data-action="reset"]').click();
    await expect(output).toHaveAttribute('data-state', 'idle');
  },

  async utilinent(page) {
    const demo = page.locator('[data-demo="utilinent"]');
    const branch = demo.locator('[data-result="utilinent-branch"]');
    const list = demo.locator('[data-result="utilinent-list"]');
    await expect(list.locator('li')).toHaveCount(2);
    await demo.locator('[data-action="toggle-list"]').click();
    await expect(branch).toHaveAttribute('data-state', 'hidden');
    await expect(list).toHaveCount(0);
    await demo.locator('[data-action="toggle-list"]').click();
    await demo.locator('[data-action="remove-item"]').first().click();
    await demo.locator('[data-action="remove-item"]').first().click();
    await expect(branch).toHaveAttribute('data-state', 'empty');
    await expect(list.locator('li')).toHaveCount(1);
    await expect(demo.locator('[data-action="remove-item"]')).toHaveCount(0);
    await demo.locator('[data-action="add-item"]').click();
    await expect(branch).toHaveAttribute('data-state', 'populated');
    await expect(demo.locator('[data-action="remove-item"]')).toHaveCount(1);
    await demo.locator('[data-action="reset"]').click();
    await expect(list.locator('li')).toHaveCount(2);
  },
};
