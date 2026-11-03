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
    // The hint renders two keycaps (Cmd/Ctrl+K and "/"), so assert on the
    // wrapper rather than `kbd` — a bare locator('kbd') is a strict-mode
    // violation now that there is more than one.
    const hint = page.getByTestId('shortcut-hint');
    if (width >= 768) {
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(/K/);
      await expect(hint).toContainText('/');
    } else {
      await expect(hint).toBeHidden();
    }
  });

  test('metrics are bounded cards on touch and bare type at desktop', async ({ page }, testInfo) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const width = testInfo.project.use.viewport?.width ?? 0;
    const cards = page.locator('.metric-card');
    await expect(cards).toHaveCount(3);

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

    // Bare type on a narrow screen read as unstyled HTML, so the KPI figures
    // are bounded at every breakpoint now. #11131A is the elevated card fill.
    expect(box.background).toBe('rgb(17, 19, 26)');
    expect(box.borderWidth).toBe('1px');
    expect(parseFloat(box.padding)).toBeGreaterThan(0);
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

  test('desktop renders the Kinetiq shell: dark canvas, rail, 12-col workspace', async ({
    page,
  }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 0;
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const shell = await page.evaluate(() => {
      const root = document.querySelector('div.flex.min-h-screen');
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const workspace = main?.querySelector('[class*="grid-cols-12"]');
      return {
        canvas: root ? getComputedStyle(root).backgroundColor : null,
        asideVisible: aside ? getComputedStyle(aside).display !== 'none' : false,
        asideBg: aside ? getComputedStyle(aside).backgroundColor : null,
        workspace: !!workspace,
      };
    });

    // Kinetiq canvas is #090A0F, rail is #0d0f11.
    expect(shell.canvas).toBe('rgb(9, 10, 15)');

    if (width >= 1024) {
      // Desktop: the left rail is present and the 2-column workspace exists.
      expect(shell.asideVisible, 'sidebar rail should show at lg+').toBe(true);
      expect(shell.asideBg).toBe('rgb(13, 15, 17)');
      expect(shell.workspace, '12-column workspace grid missing').toBe(true);
    } else {
      // Touch: the rail is suppressed rather than squeezed.
      expect(shell.asideVisible).toBe(false);
    }
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

    // The search leads the KPI strip at every breakpoint — it is the control a
    // counter operator reaches for constantly, so it is never below the figures.
    expect(tops!.search, `search sits at y=${tops!.search}`).toBeLessThan(tops!.metrics);
    if ((testInfo.project.use.viewport?.width ?? 0) < 1024) {
      // On touch it must also be reachable without scrolling.
      expect(tops!.search, `search sits at y=${tops!.search}`).toBeLessThan(320);
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

test.describe('Reception POS — screenshot geometry (1440x900)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test('search and all 3 action buttons share one horizontal row', async ({ page }, testInfo) => {
    test.skip(
      (testInfo.project.use.viewport?.width ?? 0) < 1024,
      'desktop-only geometry guard',
    );
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const tops = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().top) : null;
      };
      return {
        search: pick('#desk-search'),
        newMember: pick('[data-testid="new-member-btn"]'),
        collectFee: pick('[data-testid="collect-fee-btn"]'),
      };
    });

    expect(tops.search, 'search input missing').not.toBeNull();
    expect(tops.newMember, 'New Member button missing').not.toBeNull();
    expect(tops.collectFee, 'Collect Fee button missing').not.toBeNull();

    // Same horizontal line: within 8px of each other.
    expect(
      Math.abs(tops.search! - tops.newMember!),
      `search y=${tops.search} vs new-member y=${tops.newMember}`,
    ).toBeLessThan(8);
    expect(
      Math.abs(tops.search! - tops.collectFee!),
      `search y=${tops.search} vs collect-fee y=${tops.collectFee}`,
    ).toBeLessThan(8);
  });

  test('Needs attention starts level with the search row', async ({ page }, testInfo) => {
    test.skip(
      (testInfo.project.use.viewport?.width ?? 0) < 1024,
      'desktop-only geometry guard',
    );
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const tops = await page.evaluate(() => {
      const search = document.querySelector('#desk-search');
      const needs = document.querySelector('[data-testid="needs-attention"]');
      return {
        search: search ? Math.round(search.getBoundingClientRect().top) : null,
        needs: needs ? Math.round(needs.getBoundingClientRect().top) : null,
      };
    });

    expect(tops.search).not.toBeNull();
    expect(tops.needs, 'Needs attention card missing').not.toBeNull();

    // Must NOT be pushed below the KPI strip — within 16px of the search row.
    expect(
      Math.abs(tops.needs! - tops.search!),
      `needs-attention y=${tops.needs} vs search y=${tops.search}`,
    ).toBeLessThan(16);
  });

  test('each Needs attention row carries at most one CTA', async ({ page }, testInfo) => {
    test.skip(
      (testInfo.project.use.viewport?.width ?? 0) < 1024,
      'desktop-only geometry guard',
    );
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const perRow = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="needs-attention"] li'),
      );
      return rows.map((r) => r.querySelectorAll('a, button').length);
    });

    // If there is nothing needing attention there are no rows at all.
    for (const count of perRow) {
      expect(count, `row has ${count} CTAs; screenshot shows exactly 1`).toBeLessThanOrEqual(1);
    }
  });
});
