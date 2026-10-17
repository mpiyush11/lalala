import { expect, test, type Page, type Route } from '@playwright/test';

import { loginAsOwner } from './helpers';

/**
 * Reception POS safety net.
 *
 * This spec exists because the reception panel is the money-handling surface
 * and it previously had ZERO automated coverage: every reception test ID was
 * unreferenced by the suite, so four consecutive redesigns shipped unverified.
 *
 * The mutations here are all intercepted and fulfilled locally, never sent to
 * the database. That keeps the suite idempotent — running it twice does not
 * change who is checked in, and it cannot corrupt fixture counts.
 */

/** Supabase RPC endpoint used by the desk punch-in. */
const RPC_GLOB = '**/rest/v1/rpc/**';

function jsonRoute(body: unknown, status = 200, delayMs = 0) {
  return async (route: Route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };
}

/** Land on the reception desk and search for a member who can be punched in. */
async function openPunchTarget(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'networkidle' });

  const search = page.locator('#desk-search');
  await search.click();
  await search.fill('Divya');
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('punch-in').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Reception POS — operational hardening', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test('a throttled mutation locks its button and refuses a second submit', async ({ page }) => {
    let posts = 0;
    await page.route(RPC_GLOB, async (route) => {
      posts += 1;
      // Simulated slow 3G: the request hangs for 2s before resolving.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await openPunchTarget(page);
    const punch = page.getByTestId('punch-in').first();
    await punch.click();

    // (a) The button must be disabled and show pending copy while in flight.
    await expect(punch).toBeDisabled();
    await expect(punch).toHaveAttribute('data-pending', 'true');
    await expect(punch).toHaveText(/Punching/);

    // (b) A second click must not be possible. Playwright's actionability check
    //     treats a disabled button as not actionable, so this throws rather
    //     than silently queueing a duplicate.
    await expect(punch).toBeDisabled();
    let duplicateBlocked = false;
    try {
      await punch.click({ timeout: 1000 });
    } catch {
      duplicateBlocked = true;
    }
    expect(duplicateBlocked, 'second click must be rejected while in flight').toBe(true);

    // (c) Exactly one write was attempted.
    expect(posts, `expected 1 POST, saw ${posts}`).toBe(1);

    // (d) The control unlocks once the promise settles.
    await expect(punch).toBeEnabled({ timeout: 10_000 });
    await expect(punch).toHaveAttribute('data-pending', 'false');
  });

  test('a failed mutation unlocks the button so the operator can retry', async ({ page }) => {
    await page.route(RPC_GLOB, jsonRoute({ message: 'Boom', code: 'XX000' }, 400, 300));

    await openPunchTarget(page);
    const punch = page.getByTestId('punch-in').first();
    await punch.click();

    await expect(punch).toBeEnabled({ timeout: 10_000 });
    await expect(punch).toHaveAttribute('data-pending', 'false');
    await expect(punch).toHaveText(/Punch In/);
  });

  test('Cmd/Ctrl+K focuses the search field', async ({ page }, testInfo) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Focus something else first, to prove the shortcut is what moved focus.
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await expect(page.locator('#desk-search')).not.toBeFocused();

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+k`);

    await expect(page.locator('#desk-search')).toBeFocused();

    // The hint is only offered where a keyboard is: visible at md+, hidden on
    // touch viewports. Asserting both stops it regressing in either direction.
    const width = testInfo.project.use.viewport?.width ?? 0;
    if (width >= 768) {
      await expect(page.locator('kbd')).toBeVisible();
      await expect(page.locator('kbd')).toContainText(/K/);
    } else {
      await expect(page.locator('kbd')).toBeHidden();
    }
  });

  test('metrics are bounded cards on touch and bare type at desktop', async ({ page }, testInfo) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const width = testInfo.project.use.viewport?.width ?? 0;
    const cards = page.locator('.metric-card');
    await expect(cards).toHaveCount(4);

    const first = cards.first();
    const box = await first.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        background: cs.backgroundColor,
        borderWidth: cs.borderTopWidth,
        padding: cs.paddingTop,
        left: Math.round(rect.left),
      };
    });

    if (width >= 1024) {
      // Desktop: type directly on the canvas, no chrome around each figure.
      expect(box.background).toBe('rgba(0, 0, 0, 0)');
      expect(box.borderWidth).toBe('0px');
      expect(box.padding).toBe('0px');
    } else {
      // Touch: a real bounding box, otherwise the numbers read as loose text.
      expect(box.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(box.borderWidth).toBe('1px');
      expect(parseFloat(box.padding)).toBeGreaterThan(0);

      // And laid out as a 2-column grid, not one long wrapping row.
      const columns = await cards.evaluateAll((els) =>
        new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size,
      );
      expect(columns).toBe(2);
    }
  });

  test('Escape dismisses the check-in sheet', async ({ page }, testInfo) => {
    test.skip(
      (testInfo.project.use.viewport?.width ?? 0) >= 640,
      'the In Gym metric that opens the sheet lives in the sub-sm metric strip',
    );

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const tile = page.getByTestId('tile-ingym');
    await expect(tile).toBeVisible();
    await tile.click();

    await expect(page.getByTestId('checkin-sheet')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('checkin-sheet')).toHaveCount(0);
  });

  test('Escape dismisses the member ledger drawer', async ({ page }) => {
    await page.goto('/dashboard/members', { waitUntil: 'networkidle' });

    // The directory renders a mobile card feed AND a desktop table; only one is
    // visible at a time. `:visible` avoids grabbing the display:none one.
    const memberLink = page.locator('a[href*="member="]:visible').first();
    await expect(memberLink).toBeVisible();
    await memberLink.click();

    await expect(page.getByTestId('ledger-avatar')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('ledger-avatar')).toHaveCount(0, { timeout: 10_000 });
    expect(page.url()).not.toContain('member=');
  });

  test('a successful mutation raises a success toast', async ({ page }) => {
    await page.route(RPC_GLOB, jsonRoute(null, 200, 150));

    await openPunchTarget(page);
    await page.getByTestId('punch-in').first().click();

    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText(/checked in/i);
    await expect(toast).toHaveAttribute('data-type', 'success');
  });

  test('a failed mutation raises an error toast', async ({ page }) => {
    await page.route(RPC_GLOB, jsonRoute({ message: 'Boom', code: 'XX000' }, 400, 150));

    await openPunchTarget(page);
    await page.getByTestId('punch-in').first().click();

    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toHaveAttribute('data-type', 'error');
  });

  test('desktop workspace stays a narrow column with no rail', async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 0) < 1024, 'desktop-only layout guard');

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const layout = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;
      return {
        width: Math.round(main.getBoundingClientRect().width),
        asides: document.querySelectorAll('aside').length,
        railGrids: main.querySelectorAll(':scope > div.grid').length,
      };
    });
    expect(layout, 'main element missing').not.toBeNull();

    // The pivot's whole point: a bounded reading column instead of a stretched
    // 1152px page. If this drifts back up, the workspace feel is gone.
    expect(layout!.width, `main is ${layout!.width}px wide`).toBeLessThanOrEqual(800);
    // The right rail was deleted; a re-introduced <aside> means dead space refilled.
    expect(layout!.asides).toBe(0);
    // The 12-column grid is gone; nothing should re-wrap main's children.
    expect(layout!.railGrids).toBe(0);
  });

  test('search leads the metrics on touch viewports', async ({ page }, testInfo) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const tops = await page.evaluate(() => {
      const search = document.querySelector('#desk-search');
      const metric = document.querySelector('[data-testid="tile-active"]');
      if (!search || !metric) return null;
      return {
        search: Math.round(search.getBoundingClientRect().top + window.scrollY),
        metrics: Math.round(metric.getBoundingClientRect().top + window.scrollY),
      };
    });
    expect(tops, 'search or metric element missing').not.toBeNull();

    if ((testInfo.project.use.viewport?.width ?? 0) >= 1024) {
      // Desktop has room for both above the fold; the figures lead the page.
      expect(tops!.metrics).toBeLessThan(tops!.search);
    } else {
      // On a phone the search must win: it is the only control used constantly,
      // and at y=472 it was below the fold on a 780px screen.
      expect(tops!.search, `search sits at y=${tops!.search}`).toBeLessThan(tops!.metrics);
      expect(tops!.search).toBeLessThan(320);
    }
  });

  test('Settle Due is the primary action, not a destructive red block', async ({ page }) => {
    await page.goto('/dashboard/members?filter=dues', { waitUntil: 'networkidle' });

    const link = page.locator('a[href*="member="]:visible').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByTestId('ledger-avatar')).toBeVisible({ timeout: 10_000 });

    const settle = page.getByTestId('settle-due');
    await expect(settle).toBeVisible();

    const bg = await settle.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rgb = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
    expect(rgb, `could not parse background: ${bg}`).not.toBeNull();

    const [r, g, b] = [Number(rgb![1]), Number(rgb![2]), Number(rgb![3])];
    const looksRed = r > 150 && g < 110 && b < 110;
    expect(
      looksRed,
      `Settle Due must not be a red block — collecting money is not destructive; got ${bg}`,
    ).toBe(false);
    // It should still be a solid fill so it reads as the one primary action.
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });
});
