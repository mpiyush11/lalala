import { expect, test } from '@playwright/test';

import { BANNED_WORDS, gotoCockpit, isDesktop, loginAsOwner } from './helpers';

/**
 * Structure and information-architecture contract for the Owner Cockpit.
 *
 * Read-only: nothing here mutates the database.
 */
test.describe('Owner Cockpit home', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCockpit(page);
  });

  test('lands an owner on the cockpit straight after login', async ({ page }) => {
    // gotoCockpit navigates explicitly, so re-run a clean login to observe the
    // post-credential destination itself.
    await page.context().clearCookies();
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/owner\/dashboard$/);
  });

  test('shows no developer jargon', async ({ page }) => {
    const body = (await page.textContent('body')) ?? '';
    const found = BANNED_WORDS.filter((word) => body.includes(word));
    expect(found, `banned words in DOM: ${found.join(', ')}`).toEqual([]);
  });

  test('renders exactly four metric tiles', async ({ page }) => {
    await expect(page.getByTestId('metric-tiles')).toBeVisible();
    for (const id of ['metric-revenue', 'metric-cash', 'metric-upi', 'metric-dues']) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId(id)).toContainText('₹');
    }

    // A fifth tile would mean the strip has started accumulating again.
    const tileCount = await page.getByTestId('metric-tiles').evaluate((node) => node.children.length);
    expect(tileCount).toBe(4);
  });

  test('arranges tiles 2x2 on mobile and 4-across on desktop', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport!.width;

    const tops = await page.evaluate(() =>
      Array.from(document.querySelector('[data-testid="metric-tiles"]')!.children).map((node) =>
        Math.round(node.getBoundingClientRect().top),
      ),
    );
    const rows = new Set(tops).size;

    expect(rows).toBe(isDesktop(width) ? 1 : 2);
  });

  test('carries no dues table and no approval controls', async ({ page }) => {
    // Both were deliberately moved off Home: dues to their own tab, approval
    // gates deleted entirely.
    await expect(page.getByTestId('dues-list')).toHaveCount(0);
    await expect(page.getByTestId('due-row')).toHaveCount(0);
    await expect(page.getByTestId('expense-approve')).toHaveCount(0);
    await expect(page.getByTestId('expense-reject')).toHaveCount(0);
    await expect(page.getByTestId('close-shift-btn')).toHaveCount(0);
    await expect(page.getByTestId('counted-cash-input')).toHaveCount(0);

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/\bApprove\b/);
  });

  test('routes the dues tile to the dues ledger', async ({ page }) => {
    await page.getByTestId('metric-dues').click();
    await expect(page).toHaveURL(/\/owner\/dues$/);
    await expect(page.getByTestId('dues-list')).toBeVisible();
  });

  test('streams recent collections read-only', async ({ page }) => {
    const rows = page.getByTestId('collection-row');
    const empty = page.getByTestId('collections-empty');

    const hasRows = (await rows.count()) > 0;
    if (hasRows) {
      await expect(rows.first().getByTestId('tender-badge')).toBeVisible();
      await expect(rows).toHaveCount(Math.min(await rows.count(), 5));
      await expect(page.getByTestId('view-shift-log')).toHaveAttribute('href', '/owner/staff');
    } else {
      await expect(empty).toBeVisible();
    }
  });

  test('lists today’s expenses without any action buttons', async ({ page }) => {
    const rows = page.getByTestId('expense-row');
    if ((await rows.count()) > 0) {
      const buttons = await rows.first().locator('button').count();
      expect(buttons).toBe(0);
    } else {
      await expect(page.getByTestId('expenses-empty')).toBeVisible();
    }
  });

  test('renders the right navigation for the viewport', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport!.width;

    if (isDesktop(width)) {
      await expect(page.getByTestId('owner-sidebar')).toBeVisible();
      const links = page.getByTestId('sidebar-link');
      await expect(links).toHaveCount(4);
      expect((await links.allTextContents()).map((t) => t.trim())).toEqual([
        '🏠Home',
        '💰Dues',
        '🧾Staff & Shifts',
        '🏷️Plans',
      ]);
      expect(await page.locator('header nav a').count()).toBe(0);
    } else {
      const tabs = page.getByTestId('bottom-tab');
      await expect(tabs).toHaveCount(4);
      await expect(page.getByTestId('owner-sidebar')).toBeHidden();

      const labels = (await tabs.allTextContents()).map((t) =>
        t.trim().replace(/^[^\w]*/, '').replace(/\d+$/, ''),
      );
      expect(labels).toEqual(['Home', 'Dues', 'Staff', 'Plans']);
    }
  });

  test('offers a route back to the front desk', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport!.width;

    if (isDesktop(width)) {
      await expect(page.getByTestId('switch-to-desk')).toHaveAttribute('href', '/dashboard');
    } else {
      // The sidebar renders a second avatar that is display:none here.
      await page.locator('[data-testid="owner-avatar"]:visible').click();
      await expect(page.getByTestId('owner-dropdown')).toBeVisible();
      const links = await page.getByTestId('owner-dropdown').locator('a').allTextContents();
      expect(links.some((l) => l.includes('Front Desk'))).toBe(true);
      expect(links.some((l) => l.includes('Gym Settings'))).toBe(true);
      expect(links.some((l) => l.includes('Verify Member Bill'))).toBe(true);
    }
  });

  test('constrains and centres the desktop workspace', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.use.viewport!.width), 'desktop-only layout rule');

    const main = await page.locator('main').boundingBox();
    expect(main!.width).toBeLessThanOrEqual(1153);

    const centered = await page.evaluate(() => {
      const m = document.querySelector('main')!;
      const parent = m.parentElement!;
      const rect = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      const left = rect.left + parseFloat(style.paddingLeft);
      const right = rect.right - parseFloat(style.paddingRight);
      const own = m.getBoundingClientRect();
      return Math.abs(own.left - left - (right - own.right)) <= 2;
    });
    expect(centered).toBe(true);
  });

  test('paints the cockpit in monochrome plus one accent', async ({ page }) => {
    const offenders = await page.evaluate(() => {
      const ACCENTS = [
        /^rgba?\(\s*(?:5|16|4)\d?,\s*(?:1[0-9]{2}|[0-9]{2}),/,
        /^rgba?\(\s*24[0-5],\s*1[0-9]{2},\s*\d+/,
      ];
      const seen = new Set<string>();
      const main = document.querySelector('main');
      if (!main) return [];

      for (const node of Array.from(main.querySelectorAll('*'))) {
        const style = getComputedStyle(node);
        for (const value of [style.backgroundColor, style.color, style.borderTopColor]) {
          const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) continue;
          const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
          if (value.startsWith('rgba') && value.endsWith(', 0)')) continue;
          if (Math.max(r, g, b) - Math.min(r, g, b) <= 18) continue;
          if (ACCENTS.some((re) => re.test(value))) continue;
          seen.add(value);
        }
      }
      return [...seen];
    });

    expect(offenders, `unexpected hues: ${offenders.join(', ')}`).toEqual([]);
  });

  test('never overflows horizontally', async ({ page }) => {
    const { inner, scroll } = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });

  test('raises no client-side errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.reload({ waitUntil: 'networkidle' });
    expect(errors).toEqual([]);
  });
});

test.describe('Owner secondary screens', () => {
  test('dues ledger lists, searches and offers recovery actions', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/dues', { waitUntil: 'networkidle' });

    const rows = page.getByTestId('due-row');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();

    const wa = await page.getByTestId('due-whatsapp').first().getAttribute('href');
    expect(decodeURIComponent(wa ?? '')).toContain('ironparadise@upi');

    await page.getByTestId('dues-search').fill('Tanvi');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });

    await page.getByTestId('dues-search').fill('');
    await expect(rows).toHaveCount(before, { timeout: 10_000 });
  });

  test('staff screen shows shift status and the directory', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/staff', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('active-shift-banner')).toBeVisible();
    await expect(page.getByTestId('staff-row').first()).toBeVisible();

    await page.getByTestId('add-staff-btn').click();
    const dialog = page.getByTestId('add-staff-dialog');
    await expect(dialog).toBeVisible();
    // Save stays disabled until every field is valid.
    await expect(page.getByTestId('staff-save')).toBeDisabled();
    await page.getByTestId('staff-name').fill('Spec Trainer');
    await page.getByTestId('staff-phone').fill('9812345678');
    await page.getByTestId('staff-passcode').fill('short');
    await expect(page.getByTestId('staff-save')).toBeDisabled();
    await page.getByTestId('staff-passcode').fill('LongEnough-2026!');
    await expect(page.getByTestId('staff-save')).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('plans screen lists the catalogue', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/plans', { waitUntil: 'networkidle' });

    const rows = page.getByTestId('plan-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.first().getByTestId('plan-price')).toContainText('₹');
  });
});
