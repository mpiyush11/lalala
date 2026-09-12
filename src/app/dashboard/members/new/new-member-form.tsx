'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  initialPlanFee,
  PlanFeeSelector,
  derivePlanTerm,
  usePlanExpiry,
  type PlanFeeValue,
} from '@/components/plan-fee-selector';
import { NameField, PhoneField } from '@/components/form-inputs';
import {
  TenderSelector,
  TenderSummary,
  deriveTender,
  initialTender,
  type TenderValue,
} from '@/components/tender-selector';
import {
  isValidIndianMobile,
  normalizeIndianMobile,
  toStoredPhone,
  toTitleCase,
} from '@/lib/format/input';
import { formatDateKey } from '@/lib/format/expiry';
import type { MembershipPlan } from '@/lib/plans';
import { createClient } from '@/lib/supabase/client';

function todayForInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function NewMemberForm({
  initialName,
  initialPhone,
  plans,
  tenantId,
}: {
  initialName?: string;
  initialPhone?: string;
  plans: MembershipPlan[];
  tenantId: string;
}) {
  const router = useRouter();
  // Lead conversion pre-fills these from the desk widget; normalise on arrival
  // so a pasted +91 number matches the 10-digit field contract.
  const [fullName, setFullName] = useState(() =>
    initialName ? toTitleCase(initialName.replace(/\s+/g, ' ').trim()) : '',
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    initialPhone ? normalizeIndianMobile(initialPhone) : '',
  );
  const [planFee, setPlanFee] = useState<PlanFeeValue>(() => initialPlanFee(plans));
  const [startDate, setStartDate] = useState(todayForInput);
  const [expiryDate, setExpiryDate] = useState(
    () =>
      derivePlanTerm(initialPlanFee(plans), plans, todayForInput(), true).expiryDate ??
      todayForInput(),
  );
  const [tender, setTender] = useState<TenderValue>(initialTender);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Expiry is derived by the shared selector but stays overridable so the desk
  // can grant bonus days.
  usePlanExpiry(planFee, plans, startDate, true, setExpiryDate);

  const { durationDays } = derivePlanTerm(planFee, plans, startDate, true);

  const totalPayable = Number(planFee.fee) || 0;
  const { balanceDue, cashMinor, exceedsTotal, paidNow, upiMinor } = deriveTender(
    tender,
    totalPayable,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Re-entry guard: a fast double-click can fire submit twice before React
    // re-renders the disabled button, creating twin member rows.
    if (isSubmitting) return;

    if (!isValidIndianMobile(phoneNumber)) {
      setErrorMessage('Enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }

    const agreedAmount = Number(planFee.fee);

    if (!Number.isFinite(agreedAmount) || agreedAmount < 0) {
      setErrorMessage('Enter a valid agreed amount.');
      return;
    }

    if (exceedsTotal) {
      setErrorMessage(
        `Paid amount cannot exceed total plan fee (₹${totalPayable.toLocaleString('en-IN')}).`,
      );
      return;
    }

    if (tender.isPartial && (paidNow <= 0 || paidNow > totalPayable)) {
      setErrorMessage('Paid now must be greater than zero and cannot exceed the plan fee.');
      return;
    }

    if (!durationDays) {
      setErrorMessage('Enter a valid plan duration between 1 and 3660 days.');
      return;
    }

    if (expiryDate < startDate) {
      setErrorMessage('Expiry date cannot be before the start date.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('register_member_split_payment', {
        p_cash_minor: cashMinor,
        p_due_settlement_date: balanceDue > 0 ? tender.dueDate : null,
        p_full_name: fullName.trim(),
        p_membership_expires_on: expiryDate,
        p_membership_started_on: startDate,
        p_phone_number: toStoredPhone(phoneNumber),
        p_tenant_id: tenantId,
        p_total_due_minor: Math.round(agreedAmount * 100),
        p_upi_minor: upiMinor,
      });

      const result = Array.isArray(data) ? data[0] : data;

      if (error || !result) {
        setErrorMessage(
          error?.code === '23505'
            ? 'A member with this phone number already exists.'
            : error?.message ??
                'Unable to register the member. Check the details and try again.',
        );
        setIsSubmitting(false);
        return;
      }

      // A paid joining fee produces a receipt, so go straight to it. A zero-fee
      // (comp/trial) signup has no payment, so return to the directory.
      if (result.payment_id) {
        router.replace(`/dashboard/payments/receipt/${result.payment_id}`);
      } else {
        router.replace('/dashboard/members');
      }

      router.refresh();
    } catch {
      setErrorMessage('Unable to register the member. Please try again.');
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 sm:border-zinc-800';

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-5 pb-28 shadow-xl shadow-black/10 sm:border-zinc-800 sm:p-7 sm:pb-7"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <NameField autoFocus onChange={setFullName} value={fullName} />
        </div>

        <div className="sm:col-span-2">
          <PhoneField onChange={setPhoneNumber} value={phoneNumber} />
        </div>

        <PlanFeeSelector
          plans={plans}
          currency="INR"
          inclusiveStart
          onChange={setPlanFee}
          startDate={startDate}
          value={planFee}
        />

        <TenderSelector
          currency="INR"
          onChange={setTender}
          todayKey={startDate}
          totalPayable={totalPayable}
          value={tender}
        />

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-200">Start date</span>
          <input
            required
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={inputClass}
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-200">
            Auto expiry <span className="text-slate-500">(adjustable)</span>
          </span>
          <input
            required
            type="date"
            min={startDate}
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
            className={inputClass}
          />
          <span className="mt-1.5 block text-xs text-slate-500">
            Auto-calculated — override to grant bonus days.
          </span>
        </label>
      </div>

      <div className="mt-5">
        <TenderSummary expiryDate={expiryDate} totalPayable={totalPayable} value={tender} />
        <p className="mt-2 text-xs text-slate-500">
          Member code is allocated securely on save.
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {/* Sticky CTA: stays reachable above the virtual keyboard on phones. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={isSubmitting || exceedsTotal || paidNow <= 0}
          className="inline-flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-slate-950 shadow-cyan-glow transition hover:bg-cyan-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
              Processing…
            </>
          ) : (
            'Register & Collect'
          )}
        </button>
      </div>
    </form>
  );
}
