/**
 * Membership plan types and term maths.
 *
 * The plan CATALOGUE now lives in Postgres (`membership_plans`), owned per
 * tenant and edited from `/owner/plans`. This module keeps only what a price
 * row cannot express: the custom-duration escape hatch and the expiry
 * arithmetic, both of which must stay identical between registration and
 * renewal.
 *
 * Previously `PLAN_OPTIONS` was a hard-coded array here, so changing a price
 * meant a deploy and every tenant shared one rate card.
 */

/** A plan row as the UI consumes it. */
export type MembershipPlan = {
  durationMonths: number;
  id: string;
  isActive: boolean;
  /** Whole rupees, for the fee input. */
  priceMajor: number;
  priceMinor: number;
  name: string;
};

/** Gyms sell "months"; the ledger counts days. 30 is the house conversion. */
export const DAYS_PER_MONTH = 30;

/** Unit used by the custom-duration input. */
export type CustomUnit = 'days' | 'months';

export const CUSTOM_PLAN_ID = 'custom';
export const DEFAULT_CUSTOM_DAYS = 15;
export const MAX_PLAN_DAYS = 3660;

/** Term length in days for a catalogue plan. */
export function planDurationDays(plan: MembershipPlan): number {
  return plan.durationMonths * DAYS_PER_MONTH;
}

/**
 * Resolves the effective term length in days.
 *
 * `plan` is null when the operator picked "Custom", in which case the typed
 * value decides.
 */
export function resolveDurationDays(
  plan: MembershipPlan | null,
  customValue: string,
  customUnit: CustomUnit,
): number | null {
  if (plan) return planDurationDays(plan);

  const parsed = Number(customValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const days = customUnit === 'months' ? Math.round(parsed * DAYS_PER_MONTH) : Math.round(parsed);
  if (days <= 0 || days > MAX_PLAN_DAYS) return null;

  return days;
}

/**
 * Adds a term to a YYYY-MM-DD date key, in UTC to avoid timezone drift.
 *
 * `inclusiveStart` disambiguates two genuinely different cases that were once
 * handled by two subtly different copies of this function:
 *
 *   - true  (new registration): the start date is the member's first active
 *     day, so a 30-day term ends on start+29.
 *   - false (renewal): the start date is the previous expiry, a day already
 *     paid for under the old term, so a 30-day term ends on start+30.
 */
export function addTerm(dateKey: string, days: number, inclusiveStart: boolean): string {
  const [year, month, day] = dateKey.split('-').map(Number);

  if (!year || !month || !day || !Number.isFinite(days)) return dateKey;

  const offset = inclusiveStart ? days - 1 : days;
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/** Maps a database row onto the UI shape. */
export function toMembershipPlan(row: {
  duration_months: number;
  id: string;
  is_active: boolean;
  name: string;
  price_minor: number;
}): MembershipPlan {
  return {
    durationMonths: row.duration_months,
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    priceMajor: Math.round(row.price_minor / 100),
    priceMinor: row.price_minor,
  };
}
