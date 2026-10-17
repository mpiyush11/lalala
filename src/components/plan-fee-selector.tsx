'use client';

import { useEffect } from 'react';

import { AmountField } from '@/components/form-inputs';
import {
  CUSTOM_PLAN_ID,
  DEFAULT_CUSTOM_DAYS,
  MAX_PLAN_DAYS,
  addTerm,
  resolveDurationDays,
  type CustomUnit,
  type MembershipPlan,
} from '@/lib/plans';

export type PlanFeeValue = {
  customUnit: CustomUnit;
  customValue: string;
  fee: string;
  /** A `membership_plans.id`, or CUSTOM_PLAN_ID for a negotiated term. */
  planId: string;
};

/** Seeds the form from the tenant's own catalogue rather than a constant. */
export function initialPlanFee(plans: MembershipPlan[]): PlanFeeValue {
  const first = plans[0];
  return {
    customUnit: 'days',
    customValue: String(DEFAULT_CUSTOM_DAYS),
    fee: first ? String(first.priceMajor) : '',
    planId: first ? first.id : CUSTOM_PLAN_ID,
  };
}

function findPlan(plans: MembershipPlan[], planId: string): MembershipPlan | null {
  return plans.find((plan) => plan.id === planId) ?? null;
}

/**
 * Universal plan + fee picker shared by registration and renewal.
 *
 * The component is fully controlled: the parent owns `value` and receives the
 * derived `durationDays` / `expiryDate` through `onChange`. That keeps a single
 * authoritative copy of the state in the submitting form while this component
 * stays free of any RPC or tenant knowledge.
 *
 * Fee autofills from the selected plan but is never locked -- discounts and
 * negotiated rates are a normal front-desk reality.
 */
export function PlanFeeSelector({
  currency,
  disabled = false,
  inclusiveStart,
  onChange,
  plans,
  startDate,
  value,
}: {
  currency: string;
  disabled?: boolean;
  /** True when `startDate` is the member's first active day (registration). */
  inclusiveStart: boolean;
  onChange: (next: PlanFeeValue) => void;
  /** Live catalogue from `membership_plans`, supplied by the server page. */
  plans: MembershipPlan[];
  startDate: string;
  value: PlanFeeValue;
}) {
  const plan = findPlan(plans, value.planId);
  const isCustom = plan === null;
  const durationDays = resolveDurationDays(plan, value.customValue, value.customUnit);

  function update(patch: Partial<PlanFeeValue>) {
    onChange({ ...value, ...patch });
  }

  function changePlan(nextPlanId: string) {
    const nextPlan = findPlan(plans, nextPlanId);

    // Catalogue plans autofill their price. Custom keeps whatever the
    // receptionist already typed so a negotiated figure is not wiped out.
    onChange({
      ...value,
      fee: nextPlan ? String(nextPlan.priceMajor) : value.fee,
      planId: nextPlanId,
    });
  }

  const inputClass =
    'h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50 sm:border-zinc-800';

  return (
    <>
      <label>
        <span className="mb-2 block text-sm font-medium text-slate-200">Membership plan</span>
        <select
          value={value.planId}
          disabled={disabled}
          onChange={(event) => changePlan(event.target.value)}
          className={inputClass}
        >
          {plans.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          <option value={CUSTOM_PLAN_ID}>Custom</option>
        </select>
      </label>

      {isCustom ? (
        <label>
          <span className="mb-2 block text-sm font-medium text-slate-200">Custom duration</span>
          <div className="flex gap-2">
            <input
              required
              type="number"
              min="1"
              max={String(MAX_PLAN_DAYS)}
              step="1"
              inputMode="numeric"
              disabled={disabled}
              value={value.customValue}
              onChange={(event) => update({ customValue: event.target.value })}
              className={inputClass}
              placeholder="e.g. 45"
            />
            <select
              value={value.customUnit}
              disabled={disabled}
              onChange={(event) => update({ customUnit: event.target.value as CustomUnit })}
              className="h-12 min-h-[44px] w-32 shrink-0 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 text-base text-white outline-none focus:border-accent disabled:opacity-50 sm:border-zinc-800"
              aria-label="Custom duration unit"
            >
              <option value="days">Days</option>
              <option value="months">Months</option>
            </select>
          </div>
          <span className="mt-1.5 block text-xs text-slate-500">
            {durationDays
              ? `Term length: ${durationDays} day${durationDays === 1 ? '' : 's'}`
              : 'Enter a duration between 1 and 3660 days.'}
          </span>
        </label>
      ) : null}

      <AmountField
        currency={currency}
        disabled={disabled}
        hint={
          isCustom
            ? 'Enter the negotiated fee for this custom term.'
            : 'Autofilled from the plan — editable for discounts.'
        }
        id="plan-fee"
        label="Agreed amount / fee"
        onChange={(fee) => update({ fee })}
        value={value.fee}
      />
    </>
  );
}

/**
 * Derives duration and expiry for a given plan selection.
 *
 * Exposed as a hook-free helper so server-bound submit handlers can reuse the
 * exact same maths the UI displays.
 */
export function derivePlanTerm(
  value: PlanFeeValue,
  plans: MembershipPlan[],
  startDate: string,
  inclusiveStart: boolean,
): { durationDays: number | null; expiryDate: string | null } {
  const durationDays = resolveDurationDays(
    findPlan(plans, value.planId),
    value.customValue,
    value.customUnit,
  );

  return {
    durationDays,
    expiryDate: durationDays ? addTerm(startDate, durationDays, inclusiveStart) : null,
  };
}

/** Notifies the parent whenever the derived expiry changes. */
export function usePlanExpiry(
  value: PlanFeeValue,
  plans: MembershipPlan[],
  startDate: string,
  inclusiveStart: boolean,
  onExpiryChange: (expiry: string) => void,
) {
  const { expiryDate } = derivePlanTerm(value, plans, startDate, inclusiveStart);

  useEffect(() => {
    if (expiryDate) onExpiryChange(expiryDate);
    // onExpiryChange is intentionally excluded; parents commonly pass an inline
    // setter, which would otherwise retrigger this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryDate]);
}
