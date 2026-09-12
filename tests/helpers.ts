import type { Page } from '@playwright/test';

export const OWNER_EMAIL = 'rajesh.owner@ironparadise.com';
export const OWNER_PASSWORD = 'GymOS-Test-2026!';

/** Vocabulary the product must never show an operator. */
export const BANNED_WORDS = [
  'Variance',
  'Cryptographic',
  'Authenticator',
  'Win-Back',
  'Win-back',
  'Lapsed',
  'Petty',
  'Disbursed',
  'Reconciliation',
  'Galla',
  'Kharcha',
];

export async function loginAsOwner(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', OWNER_EMAIL);
  await page.fill('input[type="password"]', OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/owner/, { timeout: 30_000 });
}

export async function gotoCockpit(page: Page) {
  await loginAsOwner(page);
  await page.goto('/owner/dashboard', { waitUntil: 'networkidle' });
}

/** Digits out of a formatted money string: "₹27,500" -> 27500. */
export function money(text: string | null): number {
  return Number(String(text ?? '').replace(/[^\d]/g, '') || 0);
}

/** True once the sidebar is the active navigation (>= 1024px). */
export function isDesktop(width: number): boolean {
  return width >= 1024;
}
