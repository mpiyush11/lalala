import { expect, test } from '@playwright/test';

import { loginAsOwner } from './helpers';

/**
 * The point of moving plans into Postgres: an owner edits a price and the
 * counter sells at the new rate immediately, with no deploy.
 *
 * This spec mutates a real plan row. `npm test` runs the atomic fixture reset
 * afterwards, which re-asserts the canonical four plans.
 */
test.describe.configure({ mode: 'serial' });

test('a price edited in Plans reaches the reception selector', async ({ page }) => {
  const NEW_PRICE = '4321';

  await loginAsOwner(page);
  await page.goto('/owner/plans', { waitUntil: 'networkidle' });

  // Edit the 3 Months plan.
  const row = page.getByTestId('plan-row').filter({ hasText: '3 Months' }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('plan-edit').click();

  const dialog = page.getByTestId('plan-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('plan-price-input').fill(NEW_PRICE);
  await page.getByTestId('plan-save').click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // The manager reflects it.
  await expect(row.getByTestId('plan-price')).toContainText('4,321', { timeout: 20_000 });

  // Reception's registration form must autofill the new rate.
  await page.goto('/dashboard/members/new', { waitUntil: 'networkidle' });
  const select = page.locator('select').first();
  const optionLabels = await select.locator('option').allTextContents();
  expect(optionLabels).toContain('3 Months');

  const optionValue = await select
    .locator('option')
    .filter({ hasText: '3 Months' })
    .first()
    .getAttribute('value');
  await select.selectOption(optionValue!);

  await expect(page.locator('#plan-fee')).toHaveValue(NEW_PRICE, { timeout: 10_000 });

  // Restore the canonical ₹4,000 so the next project — and the next run —
  // start from a known catalogue even before the fixture reset.
  await page.goto('/owner/plans', { waitUntil: 'networkidle' });
  await row.getByTestId('plan-edit').click();
  await page.getByTestId('plan-price-input').fill('4000');
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('plan-dialog')).toBeHidden({ timeout: 20_000 });
});

test('deactivating a plan removes it from reception', async ({ page }) => {
  await loginAsOwner(page);
  await page.goto('/owner/plans', { waitUntil: 'networkidle' });

  // Each Playwright project re-runs this file against a database the previous
  // project may have left mid-edit, so drive from the row's current state
  // rather than assuming it starts active.
  const row = page.getByTestId('plan-row').filter({ hasText: '6 Months' }).first();
  await expect(row).toBeVisible();

  if ((await row.getAttribute('data-plan-active')) !== 'true') {
    await row.getByTestId('plan-toggle').click();
    await expect(row).toHaveAttribute('data-plan-active', 'true', { timeout: 20_000 });
  }

  await row.getByTestId('plan-toggle').click();
  await expect(row).toHaveAttribute('data-plan-active', 'false', { timeout: 20_000 });

  await page.goto('/dashboard/members/new', { waitUntil: 'networkidle' });
  const optionLabels = await page.locator('select').first().locator('option').allTextContents();
  // Still visible to the owner for reactivation, but no longer sellable.
  expect(optionLabels).not.toContain('6 Months');

  // Put it back so the next project starts from the canonical catalogue.
  await page.goto('/owner/plans', { waitUntil: 'networkidle' });
  await row.getByTestId('plan-toggle').click();
  await expect(row).toHaveAttribute('data-plan-active', 'true', { timeout: 20_000 });
});
