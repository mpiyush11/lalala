'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { AmountField, MAX_PAID_AMOUNT, MIN_PAID_AMOUNT } from '@/components/form-inputs';
import {
  TenderSelector,
  deriveTender,
  initialTender,
  type TenderValue,
} from '@/components/tender-selector';
import { describeExpiry, formatDateKey } from '@/lib/format/expiry';
import { buildRenewalWhatsAppUrl } from '@/lib/notifications/whatsapp';
import {
  CUSTOM_PLAN_ID,
  MAX_PLAN_DAYS,
  addTerm,
  resolveDurationDays,
  type MembershipPlan,
} from '@/lib/plans';
import { createClient } from '@/lib/supabase/client';

import { MemberCombobox, type CollectMember } from './member-combobox';
import { formatMoney as formatCurrency } from '@/lib/format/currency';

type Mode = 'due' | 'renew';
type StartMode = 'continuous' | 'fresh';

function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

/**
 * Two-column payment terminal.
 *
 * Left: read-only financial dossier for the selected member.
 * Right: the transaction controls.
 *
 * The start date is never sent by the client -- only a `continuous` | `fresh`
 * intent -- so backdating remains impossible; the server derives the real date.
 */
export function CollectPaymentForm({
  currency,
  gymName,
  initialMemberId,
  members,
  pendingByMember,
  plans,
  tenantId,
  todayKey,
}: {
  currency: string;
  gymName: string;
  initialMemberId?: string;
  members: CollectMember[];
  pendingByMember: Record<string, { amountMinor: number; id: string }>;
  /** Live catalogue from `membership_plans`, supplied by the server page. */
  plans: MembershipPlan[];
  tenantId: string;
  todayKey: string;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<CollectMember | null>(
    () => members.find((member) => member.id === initialMemberId) ?? null,
  );
  const [mode, setMode] = useState<Mode>('renew');
  const [planId, setPlanId] = useState<string>(() => plans[0]?.id ?? CUSTOM_PLAN_ID);
  const [customDays, setCustomDays] = useState('15');
  const [fee, setFee] = useState(() => String(plans[0]?.priceMajor ?? 1000));
  const [startMode, setStartMode] = useState<StartMode>('continuous');
  const [gapReason, setGapReason] = useState('');
  const [dueAmount, setDueAmount] = useState('');
  const [tender, setTender] = useState<TenderValue>(initialTender);
  const { cashPart, dueDate, isPartial, method, upiPart } = tender;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pending = selected ? pendingByMember[selected.id] : undefined;
  const isLapsed = selected ? selected.expiresOn < todayKey : false;
  const effectiveStartMode: StartMode = isLapsed ? 'fresh' : startMode;
  const startDate =
    selected && effectiveStartMode === 'continuous' ? selected.expiresOn : todayKey;

  const activePlan = plans.find((plan) => plan.id === planId) ?? null;
  const durationDays = resolveDurationDays(activePlan, customDays, 'days');
  const newExpiry = durationDays ? addTerm(startDate, durationDays, false) : null;
  const gapDays =
    selected && effectiveStartMode === 'fresh' ? daysBetween(selected.expiresOn, todayKey) : 0;
  const requiresReason = gapDays > 0;

  // Total payable vs. what is actually being tendered right now.
  const totalPayable = Number(mode === 'due' ? dueAmount : fee) || 0;
  const {
    balanceDue,
    cash: cashValue,
    cashMinor,
    exceedsTotal,
    paidNow: paidNowValue,
    splitMatches,
    splitSum,
    upi: upiValue,
    upiMinor,
  } = deriveTender(tender, totalPayable);

  const activeAmount = mode === 'due' ? dueAmount : fee;
  const amountValue = Number(activeAmount);
  const amountValid =
    Number.isFinite(amountValue) &&
    amountValue >= MIN_PAID_AMOUNT &&
    amountValue <= MAX_PAID_AMOUNT &&
    paidNowValue >= MIN_PAID_AMOUNT &&
    paidNowValue <= totalPayable &&
    splitMatches;

  function chooseMember(member: CollectMember | null) {
    setSelected(member);
    setMessage(null);
    setGapReason('');
    setStartMode(member && member.expiresOn < todayKey ? 'fresh' : 'continuous');
    const due = member ? pendingByMember[member.id] : undefined;
    setMode(due ? 'due' : 'renew');
    setDueAmount(due ? String(Math.round(due.amountMinor / 100)) : '');
  }

  function changePlan(nextPlanId: string) {
    setPlanId(nextPlanId);
    const next = plans.find((plan) => plan.id === nextPlanId);
    if (next) setFee(String(next.priceMajor));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Guard against a double-submit slipping past the disabled attribute.
    if (isSubmitting || !selected) return;

    if (exceedsTotal) {
      setMessage(
        `Paid amount cannot exceed total plan fee (₹${totalPayable.toLocaleString('en-IN')}).`,
      );
      return;
    }

    if (isPartial && (paidNowValue <= 0 || paidNowValue > totalPayable)) {
      setMessage('Paid now must be greater than zero and cannot exceed the total fee.');
      return;
    }

    if (!amountValid) {
      setMessage(`Enter an amount between ₹${MIN_PAID_AMOUNT} and ₹${MAX_PAID_AMOUNT.toLocaleString('en-IN')}.`);
      return;
    }

    if (mode === 'renew' && !durationDays) {
      setMessage('Enter a valid plan duration between 1 and 3660 days.');
      return;
    }

    if (mode === 'renew' && requiresReason && gapReason.trim().length < 3) {
      setMessage('A reason for the membership gap is required.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const amountMinor = Math.round(amountValue * 100);

      const { data, error } = await supabase.rpc('collect_split_payment', {
        p_cash_minor: cashMinor,
        p_due_settlement_date: balanceDue > 0 ? dueDate : null,
        p_duration_days: mode === 'renew' ? durationDays! : null,
        p_gap_reason:
          mode === 'renew' && requiresReason ? gapReason.replace(/\s+/g, ' ').trim() : null,
        p_member_id: selected.id,
        p_pending_payment_id: mode === 'due' ? pending!.id : null,
        p_start_mode: mode === 'renew' ? effectiveStartMode : null,
        p_tenant_id: tenantId,
        p_total_due_minor: Math.round(totalPayable * 100),
        p_upi_minor: upiMinor,
      });

      if (error || !data) {
        setMessage(error?.message ?? 'Unable to record the payment. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Stay disabled through navigation so a second click cannot double-charge.
      router.replace(`/dashboard/payments/receipt/${data.id}`);
      router.refresh();
    } catch {
      setMessage('Unable to record the payment. Please try again.');
      setIsSubmitting(false);
    }
  }

  const whatsAppUrl = selected
    ? buildRenewalWhatsAppUrl({
        expiredOn: formatDateKey(selected.expiresOn),
        gymName,
        memberName: selected.fullName,
        phoneNumber: selected.phoneNumber,
      })
    : null;

  const expiry = selected ? describeExpiry(todayKey, selected.expiresOn) : null;

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {/* ---------------- LEFT: Member financial dossier ---------------- */}
      <aside className="min-w-0 space-y-4">
        {!selected ? (
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Member
            </span>
            <MemberCombobox members={members} onSelect={chooseMember} selected={null} />
          </div>
        ) : null}

        {selected ? (
          <>
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4" data-testid="member-dossier">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/10 text-base font-bold text-accent">
                  {selected.fullName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white">{selected.fullName}</p>
                  <p className="mt-0.5 font-mono text-xs text-accent">{selected.memberCode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => chooseMember(null)}
                  className="min-h-[44px] shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs font-semibold text-slate-300 transition active:scale-[0.98]"
                >
                  Change
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <a
                  href={`tel:${selected.phoneNumber}`}
                  className="min-w-0 flex-1 truncate font-mono text-sm text-slate-300 active:text-accent"
                >
                  {selected.phoneNumber}
                </a>
                {whatsAppUrl ? (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${selected.fullName}`}
                    className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg border border-success/30 bg-success/10 text-success transition active:scale-[0.98]"
                  >
                    <WhatsAppGlyph />
                  </a>
                ) : null}
              </div>

              <dl className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Expires</dt>
                  <dd className="font-semibold text-white">{formatDateKey(selected.expiresOn)}</dd>
                </div>
                {expiry ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Status</dt>
                    <dd>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${expiry.className}`}>
                        {expiry.label}
                      </span>
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Dues</dt>
                  <dd>
                    {pending ? (
                      <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                        ⚠ {formatCurrency(pending.amountMinor, currency)} pending
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                        ✓ All Dues Settled
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-slate-500">
            Search and select a member to begin a transaction.
          </div>
        )}
      </aside>

      {/* ---------------- RIGHT: Transaction terminal ---------------- */}
      <section className="min-w-0 rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4 pb-28 sm:border-zinc-800 sm:p-5 sm:pb-5">
        {!selected ? (
          <div className="flex h-full min-h-[18rem] items-center justify-center text-center text-sm text-slate-600">
            Transaction terminal is locked until a member is selected.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {pending ? (
                <button
                  type="button"
                  onClick={() => setMode('due')}
                  className={`inline-flex h-11 min-h-[44px] items-center rounded-lg border px-4 text-xs font-bold transition active:scale-[0.98] sm:h-9 sm:min-h-0 ${
                    mode === 'due'
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Clear Due
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMode('renew')}
                className={`inline-flex h-11 min-h-[44px] items-center rounded-lg border px-4 text-xs font-bold transition active:scale-[0.98] sm:h-9 sm:min-h-0 ${
                  mode === 'renew'
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-zinc-800 bg-zinc-950/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚡ Renew Plan
              </button>
            </div>

            {mode === 'renew' ? (
              <>
                <div className="mt-5">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Plan</span>
                  <div className="flex flex-wrap gap-2">
                    {[...plans.map((plan) => ({ id: plan.id, label: plan.name })), {
                      id: CUSTOM_PLAN_ID,
                      label: 'Custom Days',
                    }].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => changePlan(option.id)}
                        className={`inline-flex h-11 min-h-[44px] items-center rounded-lg border px-4 text-xs font-bold transition active:scale-[0.98] sm:h-10 sm:min-h-0 ${
                          planId === option.id
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-zinc-800 bg-zinc-950/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {planId === CUSTOM_PLAN_ID ? (
                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Custom duration (days)
                    </span>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      value={customDays}
                      onChange={(event) =>
                        setCustomDays(event.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      onKeyDown={(event) => {
                        if (['e', 'E', '+', '-', '.'].includes(event.key)) event.preventDefault();
                      }}
                      placeholder="e.g. 45"
                      className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 font-mono text-base text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 sm:border-zinc-800"
                    />
                    <span className="mt-1.5 block text-xs text-slate-500">
                      {durationDays
                        ? `Term length: ${durationDays} days`
                        : `Enter 1 to ${MAX_PLAN_DAYS} days.`}
                    </span>
                  </label>
                ) : null}
              </>
            ) : null}

            <div className="mt-4">
              <AmountField
                currency={currency}
                id="terminal-amount"
                label={mode === 'due' ? 'Settlement amount' : 'Agreed amount / fee'}
                onChange={mode === 'due' ? setDueAmount : setFee}
                value={activeAmount}
                hint={
                  mode === 'due'
                    ? 'Pre-filled from the outstanding balance.'
                    : 'Autofilled from the plan — editable for discounts.'
                }
              />
            </div>

            {/* Shared tender engine: same component as registration. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TenderSelector
                currency={currency}
                onChange={setTender}
                todayKey={todayKey}
                totalPayable={totalPayable}
                value={tender}
              />
            </div>

            {mode === 'renew' ? (
              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-medium text-slate-200">Renewal start</legend>
                <div
                  role="radiogroup"
                  aria-label="Renewal start"
                  data-testid="start-mode-toggle"
                  className="inline-flex w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={effectiveStartMode === 'continuous'}
                    disabled={isLapsed}
                    onClick={() => setStartMode('continuous')}
                    className={`min-h-[44px] flex-1 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                      effectiveStartMode === 'continuous'
                        ? 'border border-accent bg-accent/15 text-accent'
                        : 'text-slate-400'
                    }`}
                  >
                    Continue from Expiry
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={effectiveStartMode === 'fresh'}
                    onClick={() => setStartMode('fresh')}
                    className={`min-h-[44px] flex-1 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] ${
                      effectiveStartMode === 'fresh'
                        ? 'border border-accent bg-accent/15 text-accent'
                        : 'text-slate-400'
                    }`}
                  >
                    Start Today
                  </button>
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                  Starts {formatDateKey(startDate)}
                  {isLapsed ? ' · lapsed, locked to today' : ''}
                </p>
              </fieldset>
            ) : null}

            {mode === 'renew' && requiresReason ? (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  Reason for gap <span className="text-danger">*</span>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={gapReason}
                  onChange={(event) => setGapReason(event.target.value)}
                  onBlur={(event) => setGapReason(event.target.value.replace(/\s+/g, ' ').trim())}
                  placeholder="e.g. Out of city, Medical reason"
                  className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 sm:border-zinc-800"
                />
                <span className="mt-1.5 block text-xs text-slate-500">
                  {gapDays} day gap since {formatDateKey(selected.expiresOn)}. Logged for admin review.
                </span>
              </label>
            ) : null}

            {amountValid ? (
              <p
                data-testid="summary-strip"
                className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs font-semibold text-slate-300"
              >
                Plan: <span className="font-mono text-white">₹{totalPayable.toLocaleString('en-IN')}</span>
                {' • '}Paid: <span className="font-mono text-white">₹{paidNowValue.toLocaleString('en-IN')}</span>
                {method === 'split'
                  ? ` (Split: ₹${cashValue.toLocaleString('en-IN')} Cash + ₹${upiValue.toLocaleString('en-IN')} UPI)`
                  : ` (${method.toUpperCase()})`}
                {balanceDue > 0 ? (
                  <>
                    {' • '}
                    <span className="text-amber-300">Balance Due: ₹{balanceDue.toLocaleString('en-IN')}</span>
                  </>
                ) : null}
                {mode === 'renew' && newExpiry ? (
                  <>
                    {' • '}
                    <span className="text-accent">Expiry: {formatDateKey(newExpiry)}</span>
                  </>
                ) : null}
              </p>
            ) : null}

            {message ? (
              <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
                {message}
              </p>
            ) : null}

            <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0 sm:backdrop-blur-none">
            <button
              type="submit"
              disabled={isSubmitting || !amountValid}
              className="inline-flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-slate-950 shadow-cyan-glow transition hover:bg-cyan-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                  Processing…
                </>
              ) : (
                `Collect ₹${paidNowValue > 0 ? paidNowValue.toLocaleString('en-IN') : '0'} & Issue Receipt`
              )}
            </button>
            </div>
          </>
        )}
      </section>
    </form>
  );
}
