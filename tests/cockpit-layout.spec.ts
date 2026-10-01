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

  test('routes an owner at the root URL straight to the cockpit', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsOwner(page);

    // The root used to hard-redirect everyone to the front desk, so owners had
    // to switch across by hand on every visit.
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/owner\/dashboard$/);
  });

  test('keeps the brand header free of actions', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.use.viewport!.width), 'desktop sidebar only');

    const block = page.getByTestId('sidebar-brand-block');
    await expect(block).toBeVisible();

    // Brand + desk status only. Nothing tappable belongs in a glance surface.
    expect(await block.locator('a, button').count()).toBe(0);
    await expect(block).not.toContainText('Switch to Front Desk');
  });

  test('offers Switch to Front Desk from the profile menu', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.use.viewport!.width), 'desktop sidebar only');

    // Both the sidebar and the (display:none) mobile header carry an avatar.
    await page.locator('[data-testid="owner-avatar"]:visible').click();
    await expect(page.getByTestId('owner-dropdown')).toBeVisible();
    await expect(page.getByTestId('menu-switch-to-desk')).toHaveAttribute('href', '/dashboard');
    await expect(page.getByTestId('sidebar-sign-out')).toBeVisible();
    await page.keyboard.press('Escape');
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

  test('gives each tile a label under a dominant figure', async ({ page }) => {
    const sizes = await page.evaluate(() => {
      const tile = document.querySelector('[data-testid="metric-revenue"]')!;
      const [label, figure] = Array.from(tile.querySelectorAll('p'));
      return {
        figure: parseFloat(getComputedStyle(figure).fontSize),
        figureWeight: Number(getComputedStyle(figure).fontWeight),
        label: parseFloat(getComputedStyle(label).fontSize),
        labelTransform: getComputedStyle(label).textTransform,
      };
    });

    // CHECKPOINT_V1_RECEPTION_PURE: the label is now the reception `StatCard`
    // token — `text-sm font-medium text-slate-400`, sentence case. The old
    // 10px uppercase micro-label is gone.
    expect(sizes.label).toBeLessThanOrEqual(14);
    expect(sizes.labelTransform).toBe('none');
    expect(sizes.figure).toBeGreaterThanOrEqual(24);
    expect(sizes.figureWeight).toBeGreaterThanOrEqual(700);
  });

  test('marks the dues tile as tappable', async ({ page }) => {
    const tile = page.getByTestId('metric-dues');
    await expect(tile).toContainText('Tap to view ledger');
    await expect(tile).toContainText('→');
    // A press affordance the three static tiles must not have.
    await expect(tile).toHaveClass(/active:scale-\[0\.98\]/);
    await expect(page.getByTestId('metric-revenue')).not.toHaveClass(/active:scale/);
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

  test('merges both money flows into one audit log', async ({ page }) => {
    const rows = page.getByTestId('audit-row');
    const empty = page.getByTestId('audit-empty');

    if ((await rows.count()) > 0) {
      await expect(page.getByTestId('audit-log')).toBeVisible();
      // Direction is carried by a signed, coloured amount — not by which of
      // two separate boxes a row happened to live in.
      for (const direction of await rows.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute('data-direction')),
      )) {
        expect(['in', 'out']).toContain(direction);
      }
    } else {
      // Executive empty state: a deliberate destination carrying an icon and
      // an explanation of what will stream in here — NOT the old one-line
      // strip. It is therefore taller by design, but still bounded: the guard
      // exists to catch a regression back to a full-height ghost box.
      await expect(empty).toBeVisible();
      const height = await empty.evaluate((n) => n.getBoundingClientRect().height);
      // Measured 220px at 360px, 200px from 390px up. The two cards this
      // replaced were ~130px combined.
      expect(height).toBeLessThanOrEqual(260);
      // An icon is what makes it read as a place rather than a gap.
      await expect(empty.locator('svg')).toHaveCount(1);
    }
  });

  test('keeps the audit log read-only', async ({ page }) => {
    const rows = page.getByTestId('audit-row');
    if ((await rows.count()) > 0) {
      expect(await rows.first().locator('button').count()).toBe(0);
    }
  });

  test('renders the right navigation for the viewport', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport!.width;

    if (isDesktop(width)) {
      await expect(page.getByTestId('owner-sidebar')).toBeVisible();
      const links = page.getByTestId('sidebar-link');
      // Four operations plus the two tools promoted out of the profile menu.
      await expect(links).toHaveCount(6);
      expect((await links.allTextContents()).map((t) => t.trim())).toEqual([
        'Home',
        'Dues',
        'Staff & Shifts',
        'Plans',
        'Verify Member Bill',
        'Gym Settings',
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

  test('matches the front desk shell and card tokens', async ({ page }) => {
    // Parity is the whole point: both panels now render a `bg-canvas` shell
    // with `bg-surface` cards behind a `border-border/70` hairline. The owner
    // panel previously ran a near-black card on a #121212 shell, only a few
    // luminance points apart, which is what made it read muddy.
    const shell = await page.evaluate(
      () => getComputedStyle(document.querySelector('.min-h-screen')!).backgroundColor,
    );
    expect(shell).toBe('rgb(18, 18, 18)'); // bg-canvas, identical to /dashboard

    const card = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('[data-testid="metric-revenue"]')!);
      return { bg: style.backgroundColor, border: style.borderTopColor };
    });
    // Identical to the reception `StatCard`: `border-border/70` on `bg-surface`.
    expect(card.bg).toBe('rgb(30, 30, 46)'); // bg-surface #1E1E2E
    expect(card.border).toBe('rgba(60, 73, 76, 0.7)'); // border-border/70 #3C494C
  });

  test('constrains content so figures stay within one eye-scan', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.use.viewport!.width), 'desktop-only reading guard');

    const main = await page.locator('main').boundingBox();
    expect(main!.width).toBeLessThanOrEqual(1088); // max-w-5xl + lg:px-8
  });

  test('paints the cockpit in the sanctioned neutrals plus accents', async ({ page }) => {
    const offenders = await page.evaluate(() => {
      // CHECKPOINT_V1_RECEPTION_PURE palette, as rendered RGB.
      //
      // Neutrals. Slate carries real chroma (slate-500 is rgb(100,116,139)), so
      // unlike the old all-zinc palette it cannot ride on the max-min <= 18
      // shortcut further down; every sanctioned neutral is enumerated instead.
      const NEUTRALS = [
        /^rgba?\(\s*226,\s*232,\s*240(?:\s*,\s*[\d.]+)?\)/, // slate-200
        /^rgba?\(\s*203,\s*213,\s*225(?:\s*,\s*[\d.]+)?\)/, // slate-300
        /^rgba?\(\s*148,\s*163,\s*184(?:\s*,\s*[\d.]+)?\)/, // slate-400
        /^rgba?\(\s*100,\s*116,\s*139(?:\s*,\s*[\d.]+)?\)/, // slate-500
        /^rgba?\(\s*71,\s*85,\s*105(?:\s*,\s*[\d.]+)?\)/, // slate-600
        /^rgba?\(\s*18,\s*18,\s*18(?:\s*,\s*[\d.]+)?\)/, // canvas           #121212
        /^rgba?\(\s*30,\s*30,\s*46(?:\s*,\s*[\d.]+)?\)/, // surface          #1E1E2E
        /^rgba?\(\s*39,\s*39,\s*58(?:\s*,\s*[\d.]+)?\)/, // surface-elevated #27273A
        /^rgba?\(\s*60,\s*73,\s*76(?:\s*,\s*[\d.]+)?\)/, // border           #3C494C
      ];
      // Accents. Each still has exactly one job.
      const ACCENTS = [
        /^rgba?\(\s*(?:5|16|52),\s*(?:150|185|211),\s*(?:105|129|153)(?:\s*,\s*[\d.]+)?\)/, // emerald / success #10B981
        /^rgba?\(\s*34,\s*211,\s*238(?:\s*,\s*[\d.]+)?\)/, // accent cyan #22D3EE
        /^rgba?\(\s*239,\s*68,\s*68(?:\s*,\s*[\d.]+)?\)/, // danger     #EF4444
        /^rgba?\(\s*(?:251|244),\s*(?:113|63),\s*(?:133|94)(?:\s*,\s*[\d.]+)?\)/, // rose
        /^rgba?\(\s*(?:245|251),\s*(?:158|191),\s*(?:11|36)(?:\s*,\s*[\d.]+)?\)/, // amber
        /^rgba?\(\s*(?:56|14),\s*(?:189|165),\s*(?:248|233)(?:\s*,\s*[\d.]+)?\)/, // sky
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
          if (NEUTRALS.some((re) => re.test(value))) continue;
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

  test('dues rows show full overdue text without clipping at 360px', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/dues', { waitUntil: 'networkidle' });

    const badges = page.getByTestId('overdue-badge');
    test.skip((await badges.count()) === 0, 'no overdue members in the current fixture state');

    // The bug this layout fixes: "14 days overdue" clipping to "14 d…".
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="overdue-badge"]'))
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.textContent),
    );
    expect(clipped, `clipped badges: ${clipped.join(', ')}`).toEqual([]);

    for (const text of await badges.allTextContents()) {
      // Singular at exactly one day: "1 day overdue", not "1 days overdue".
      expect(text).toMatch(/^\d+ days? overdue$/);
      expect(text).not.toContain('…');
    }

    // rose-400 on a rose tint: overdue is the one thing allowed to look urgent.
    await expect(badges.first()).toHaveCSS('color', 'rgb(253, 164, 175)'); // rose-300
  });

  test('dues rows split identity from money without overflowing', async ({ page }, testInfo) => {
    const phone = !isDesktop(testInfo.project.use.viewport!.width);
    await loginAsOwner(page);
    await page.goto('/owner/dues', { waitUntil: 'networkidle' });

    const row = page.getByTestId('due-row').first();
    await expect(row).toBeVisible();

    // Amount sits to the right of the name, and the actions sit under it.
    const geometry = await row.evaluate((node) => {
      const name = node.querySelector('p')!.getBoundingClientRect();
      const collect = node.querySelector('[data-testid="due-collect"]')!.getBoundingClientRect();
      const whatsapp = node.querySelector('[data-testid="due-whatsapp"]');
      return {
        collectBelowName: collect.top >= name.bottom - 1,
        collectHeight: Math.round(collect.height),
        collectRight: collect.left > name.left,
        rowRight: node.getBoundingClientRect().right,
        whatsappSquare: whatsapp
          ? Math.abs(whatsapp.getBoundingClientRect().width - whatsapp.getBoundingClientRect().height) <= 2
          : true,
      };
    });

    expect(geometry.collectRight).toBe(true);
    // Phones stack the actions under the amount to protect the name's width.
    // Desktop has room to run them inline, which removes a hollow row middle.
    if (phone) expect(geometry.collectBelowName).toBe(true);
    expect(geometry.whatsappSquare).toBe(true);
    expect(geometry.collectHeight).toBeGreaterThanOrEqual(28);

    const { inner, scroll } = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(inner);
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

  test('bottom nav uses vector icons, not emoji', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo.project.use.viewport!.width), 'phone-only tab bar');

    await gotoCockpit(page);
    const tabs = page.getByTestId('bottom-tab');

    // Every tab must carry a real <svg>; emoji rendered as tofu wherever the
    // system emoji font was absent.
    for (let i = 0; i < (await tabs.count()); i += 1) {
      await expect(tabs.nth(i).locator('svg')).toHaveCount(1);
    }

    const active = tabs.filter({ has: page.locator('[aria-current="page"]') });
    void active;
    // Home is the active tab here: accent cyan stroke, slate for the rest.
    await expect(tabs.first()).toHaveCSS('color', 'rgb(34, 211, 238)'); // text-accent
    await expect(tabs.nth(1)).toHaveCSS('color', 'rgb(100, 116, 139)'); // text-slate-500
  });

  test('staff directory shows a semantic pill per role', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/staff', { waitUntil: 'networkidle' });

    const pills = page.getByTestId('role-pill');
    await expect(pills.first()).toBeVisible();

    // One hue per role, and never raw lowercase enum text.
    for (const text of await pills.allTextContents()) {
      expect(text).toMatch(/^(OWNER|RECEPTIONIST|TRAINER|SUPERADMIN)$/);
    }

    const trainer = pills.filter({ hasText: 'TRAINER' }).first();
    if ((await trainer.count()) > 0) {
      await expect(trainer).toHaveCSS('color', 'rgb(56, 189, 248)');
    }
    await expect(pills.filter({ hasText: 'OWNER' }).first()).toHaveCSS(
      'color',
      'rgb(251, 191, 36)',
    );
  });

  test('active shift card pulses and splits cash in from cash out', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/staff', { waitUntil: 'networkidle' });

    const card = page.getByTestId('active-shift-banner');
    const state = await card.getAttribute('data-shift-state');

    if (state === 'open') {
      await expect(page.getByTestId('shift-pulse')).toHaveClass(/animate-pulse/);
      await expect(page.getByTestId('shift-cash')).toContainText('+₹');
      await expect(page.getByTestId('shift-cash')).toHaveCSS('color', 'rgb(52, 211, 153)');
      await expect(page.getByTestId('shift-expenses')).toContainText('−₹');
    } else {
      await expect(page.getByTestId('no-shift')).toBeVisible();
    }
  });

  test('dues rows stay inside a readable column on a wide monitor', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.use.viewport!.width), 'desktop-only reading guard');

    await loginAsOwner(page);
    await page.goto('/owner/dues', { waitUntil: 'networkidle' });

    const span = await page.evaluate(() => {
      const name = document.querySelector('[data-testid="due-row"] p')!.getBoundingClientRect();
      const collect = document.querySelector('[data-testid="due-collect"]')!.getBoundingClientRect();
      return Math.round(collect.right - name.left);
    });
    // Previously ~1000px at 1440, with the balance thrown to the far edge.
    expect(span).toBeLessThanOrEqual(800);
  });

  test('gives dues rows an interactive, punchy ledger feel', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/dues', { waitUntil: 'networkidle' });

    // Total outstanding sits beside the search in high contrast.
    await expect(page.getByTestId('dues-total')).toHaveCSS('color', 'rgb(255, 255, 255)');

    // The whole row is a hover surface, so it reads as an interactive ledger.
    // Asserted on the raised token rather than `hover:bg-zinc-900`: that shade
    // is now aliased to `surface`, which is the row's own parent colour, so the
    // class alone would pass while the hover rendered invisible.
    const row = page.getByTestId('due-row').first();
    await expect(row).toHaveClass(/hover:bg-surface-elevated/);

    const badge = page.getByTestId('overdue-badge').first();
    if ((await badge.count()) > 0) {
      await expect(badge).toHaveCSS('color', 'rgb(253, 164, 175)'); // rose-300
      const weight = await badge.evaluate((n) => getComputedStyle(n).fontWeight);
      expect(Number(weight)).toBeGreaterThanOrEqual(600);
    }

    // Both triggers carry a defined edge rather than floating as soft pills.
    for (const id of ['due-whatsapp', 'due-collect']) {
      const width = await page
        .getByTestId(id)
        .first()
        .evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth));
      expect(width).toBeGreaterThan(0);
    }
  });

  test('renders every owner surface without emoji glyphs', async ({ page }) => {
    // Emoji resolve against a system font several Android webviews omit, so
    // they render as tofu boxes. Every icon in the cockpit must be an SVG.
    await loginAsOwner(page);
    for (const route of [
      '/owner/dashboard',
      '/owner/dues',
      '/owner/staff',
      '/owner/plans',
      '/owner/verify-receipt',
      '/owner/settings',
    ]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const text = (await page.textContent('body')) ?? '';
      // Emoji-presentation ranges only. A blanket `> 0x2100` also caught the
      // typographic arrow (U+2192), which the front desk uses in three places
      // and which renders as text in every font — narrowing keeps the check
      // meaningful instead of forcing a parity-breaking change.
      const EMOJI =
        /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
      const emoji = text.match(EMOJI) ?? [];
      expect(emoji, `${route} rendered emoji: ${emoji.join('')}`).toEqual([]);
    }
  });

  test('keeps the fraud alert visually alarming', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/verify-receipt', { waitUntil: 'networkidle' });

    await page.getByTestId('receipt-query').fill('SEC-0000-0000');
    await page.getByTestId('verify-btn').click();

    const alert = page.getByTestId('fraud-alert');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    // A blanket palette sweep once flattened this to neutral zinc, which made
    // a forged receipt look like ordinary body copy.
    await expect(alert).toHaveCSS('border-top-color', 'rgba(244, 63, 94, 0.4)');
  });

  test('marks a live desk session distinctly', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/staff', { waitUntil: 'networkidle' });

    const card = page.getByTestId('active-shift-banner');
    if ((await card.getAttribute('data-shift-state')) === 'open') {
      // An emerald-tinted border separates a running session from inert cards.
      await expect(card).toHaveCSS('border-top-color', 'rgba(16, 185, 129, 0.25)');
    }
  });

  test('plan rows carry exactly one control', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/plans', { waitUntil: 'networkidle' });

    const rows = page.getByTestId('plan-row');
    await expect(rows.first()).toBeVisible();

    // The [Deactivate][Edit] cluster is gone; activation moved into the sheet.
    for (let i = 0; i < (await rows.count()); i += 1) {
      await expect(rows.nth(i).locator('button')).toHaveCount(1);
    }
    await expect(page.getByTestId('plan-toggle')).toHaveCount(0);

    // And the toggle that replaced it is labelled by state, not by action.
    await rows.first().getByTestId('plan-edit').click();
    await expect(page.getByTestId('plan-dialog')).toBeVisible();
    const toggle = page.getByTestId('plan-active-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('plan-dialog')).toContainText('Available at reception');
    await page.keyboard.press('Escape');
  });

  test('plans screen lists the catalogue', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/owner/plans', { waitUntil: 'networkidle' });

    const rows = page.getByTestId('plan-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.first().getByTestId('plan-price')).toContainText('₹');
  });
});
