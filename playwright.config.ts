import { readFileSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// Load `.env.local` the way Next.js does. Specs talk to Supabase directly for
// fixture-derived values, so they need the same public keys the app uses.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {
  // Absent in CI, where the variables are injected by the runner.
}

/**
 * One suite, six viewports, real database.
 *
 * The cockpit has both a phone layout and a desktop layout with genuinely
 * different DOM, so viewport is a `project` rather than a loop inside a test —
 * a failure then names the exact screen size that broke.
 *
 * `BASE_URL` lets the same suite run against an already-running dev server
 * (the usual local loop) or a fresh one started by `webServer`.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  // Mutation specs write to a shared database; running them concurrently would
  // make every count assertion a race.
  retries: process.env.CI ? 1 : 0,
  testDir: './tests',
  timeout: 60_000,
  use: {
    actionTimeout: 15_000,
    baseURL: BASE_URL,
    launchOptions: { args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,

  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { height: 740, width: 360 } },
    },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { height: 844, width: 390 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { height: 800, width: 1280 } },
    },
  ],
});
