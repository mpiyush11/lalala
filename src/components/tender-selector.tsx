'use client';

import { AmountField } from '@/components/form-inputs';
import { formatDateKey } from '@/lib/format/expiry';

export type TenderMethod = 'cash' | 'upi' | 'split';

export type TenderValue = {
  cashPart: string;
  dueDate: string;
  isPartial: boolean;
  method: TenderMethod;
  paidNow: string;
  upiPart: string;
};

export function initialTender(): TenderValue {
  const due = new Date();
  due.setDate(due.getDate() + 7);

  return {
    cashPart: '',
    dueDate: due.toISOString().slice(0, 10),
    isPartial: false,
    method: 'cash',
    paidNow: '',
    upiPart: '',
  };
}

/**
 * Everything the caller needs to validate and submit a tender.
 *
 * Split tender is ALWAYS the sum of its two inputs -- the receptionist enters
 * cash and UPI once and the paid amount is derived. Requiring them to re-type
 * the same total into a separate "Paid Now" box was pure duplicate entry and a
 * reliable source of mismatched records.
 */
export function deriveTender(value: TenderValue, totalPayable: number) {
  const cash = Number(value.cashPart) || 0;
  const upi = Number(value.upiPart) || 0;
  const splitSum = cash + upi;
  const isSplit = value.method === 'split';

  // Split: derived from the two inputs. Single mode + partial: manual entry.
  // Single mode, full payment: the whole plan fee.
  const paidNow = isSplit ? splitSum : value.isPartial ? Number(value.paidNow) || 0 : totalPayable;

  const exceedsTotal = paidNow > totalPayable;
  const balanceDue = Math.max(0, totalPayable - paidNow);
  const isFullySettled = totalPayable > 0 && paidNow === totalPayable;

  // A split no longer needs to "match" a separately typed figure; the only
  // failure mode left is tendering more than the plan is worth.
  const splitMatches = !isSplit || !exceedsTotal;

  return {
    balanceDue,
    cash,
    cashMinor: Math.round((isSplit ? cash : value.method === 'cash' ? paidNow : 0) * 100),
    exceedsTotal,
    isFullySettled,
    paidNow,
    splitMatches,
    splitSum,
    upi,
    upiMinor: Math.round((isSplit ? upi : value.method === 'upi' ? paidNow : 0) * 100),
  };
}

const TENDERS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'split', label: 'Split' },
] as const;

/**
 * Shared 3-way tender selector with split inputs and partial-due capture.
 *
 * Extracted so registration and collection stay behaviourally identical --
 * they previously drifted, leaving onboarding on a stale single-method
 * dropdown that could not record a part payment.
 */
export function TenderSelector({
  currency,
  onChange,
  todayKey,
  totalPayable,
  value,
}: {
  currency: string;
  onChange: (next: TenderValue) => void;
  todayKey: string;
  totalPayable: number;
  value: TenderValue;
}) {
  const { balanceDue, cash, exceedsTotal, isFullySettled, splitSum, upi } = deriveTender(
    value,
    totalPayable,
  );

  function update(patch: Partial<TenderValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <>
      <div className="sm:col-span-2">
        <span className="mb-2 block text-sm font-medium text-slate-200">Payment mode</span>
        <div
          role="radiogroup"
          aria-label="Payment mode"
          data-testid="tender-selector"
          className="flex w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1"
        >
          {TENDERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value.method === option.id}
              onClick={() => update({ method: option.id })}
              className={`min-h-[44px] flex-1 rounded-lg px-2 text-xs font-bold uppercase tracking-wide transition active:scale-[0.98] ${
                value.method === option.id
                  ? 'bg-accent text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {value.method === 'split' ? (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="split-inputs">
          <AmountField
            currency={currency}
            id="split-cash"
            label="Cash Amount"
            onChange={(cashPart) => update({ cashPart })}
            value={value.cashPart}
          />
          <AmountField
            currency={currency}
            id="split-upi"
            label="UPI Amount"
            onChange={(upiPart) => update({ upiPart })}
            value={value.upiPart}
          />
          <p
            data-testid="split-sum"
            className={`rounded-lg px-3 py-2 text-xs font-semibold sm:col-span-2 ${
              exceedsTotal
                ? 'bg-danger/10 text-red-200'
                : isFullySettled
                  ? 'bg-success/10 text-success'
                  : 'bg-amber-400/10 text-amber-300'
            }`}
          >
            {exceedsTotal ? (
              <>Paid amount cannot exceed total plan fee (₹{totalPayable.toLocaleString('en-IN')})</>
            ) : isFullySettled ? (
              <>
                Full payment settled (₹{splitSum.toLocaleString('en-IN')}/₹
                {totalPayable.toLocaleString('en-IN')}) ✓
              </>
            ) : (
              <>
                Paid Now: ₹{splitSum.toLocaleString('en-IN')} • Balance Due: ₹
                {balanceDue.toLocaleString('en-IN')}
                {value.isPartial ? <> • Settle by {formatDateKey(value.dueDate)}</> : null}
              </>
            )}
          </p>
        </div>
      ) : null}

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.isPartial}
          data-testid="partial-toggle"
          onChange={(event) =>
            update({ isPartial: event.target.checked, paidNow: event.target.checked ? value.paidNow : '' })
          }
          className="h-5 w-5 accent-accent"
        />
        <span className="text-sm font-medium text-slate-200">
          Accept Partial Payment (Record Pending Due)
        </span>
      </label>

      {value.isPartial ? (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="partial-fields">
          {value.method === 'split' ? (
            // Derived from the split inputs above -- never re-typed.
            <div
              data-testid="paid-now-derived"
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
            >
              <p className="text-sm font-medium text-slate-200">Paid Now (auto)</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
                ₹{splitSum.toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Cash ₹{cash.toLocaleString('en-IN')} + UPI ₹{upi.toLocaleString('en-IN')}
              </p>
            </div>
          ) : (
            <AmountField
              currency={currency}
              id="paid-now"
              label="Paid Now"
              onChange={(next) => update({ paidNow: next })}
              value={value.paidNow}
            />
          )}
          <label htmlFor="due-date" className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              Due Settlement Date
            </span>
            <input
              id="due-date"
              type="date"
              min={todayKey}
              value={value.dueDate}
              onChange={(event) => update({ dueDate: event.target.value })}
              className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent"
            />
            <span className="mt-1.5 block text-xs text-slate-500">
              {formatDateKey(value.dueDate)}
            </span>
          </label>
          <p
            data-testid="balance-due"
            className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300 sm:col-span-2"
          >
            Balance Due: ₹{balanceDue.toLocaleString('en-IN')} · settle by{' '}
            {formatDateKey(value.dueDate)}
          </p>
        </div>
      ) : null}
    </>
  );
}

/**
 * Mathematically explicit summary.
 *
 * Deliberately never labels the tendered amount as "Total": the plan price and
 * the amount handed over are different numbers whenever a partial payment is
 * taken, and conflating them hid outstanding balances.
 */
export function TenderSummary({
  expiryDate,
  totalPayable,
  value,
}: {
  expiryDate?: string | null;
  totalPayable: number;
  value: TenderValue;
}) {
  const { balanceDue, cash, paidNow, upi } = deriveTender(value, totalPayable);

  if (!totalPayable || paidNow <= 0) return null;

  const tenderLabel =
    value.method === 'split'
      ? `Split: ₹${cash.toLocaleString('en-IN')} Cash + ₹${upi.toLocaleString('en-IN')} UPI`
      : value.method.toUpperCase();

  return (
    <p
      data-testid="summary-strip"
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs font-semibold text-slate-300"
    >
      Plan: <span className="font-mono text-white">₹{totalPayable.toLocaleString('en-IN')}</span>
      {' • '}Paid: <span className="font-mono text-white">₹{paidNow.toLocaleString('en-IN')}</span>{' '}
      ({tenderLabel})
      {balanceDue > 0 ? (
        <>
          {' • '}
          <span className="text-amber-300">
            Balance Due: ₹{balanceDue.toLocaleString('en-IN')}
          </span>
        </>
      ) : null}
      {expiryDate ? (
        <>
          {' • '}
          <span className="text-accent">Expiry: {formatDateKey(expiryDate)}</span>
        </>
      ) : null}
    </p>
  );
}
