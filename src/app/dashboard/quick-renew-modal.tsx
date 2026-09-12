'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export type QuickRenewTarget = {
  fullName: string;
  id: string;
  lastAmountMinor: number | null;
  memberCode: string;
};

const DURATION_OPTIONS = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
] as const;

const DEFAULT_AMOUNT_MINOR = 100000;

function toMajor(amountMinor: number): string {
  return String(Math.round(amountMinor / 100));
}

/**
 * One-click renewal without leaving the dashboard.
 *
 * Calls `quick_renew_member`, which atomically records the settled payment and
 * extends the expiry. Tenant and role are re-verified inside that function from
 * the JWT, so nothing here is trusted for authorization.
 */
export function QuickRenewModal({
  currency,
  onClose,
  target,
  tenantId,
}: {
  currency: string;
  onClose: () => void;
  target: QuickRenewTarget;
  tenantId: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    toMajor(target.lastAmountMinor ?? DEFAULT_AMOUNT_MINOR),
  );
  const [days, setDays] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function renew(method: 'cash' | 'upi') {
    const majorUnits = Number(amount);

    if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('quick_renew_member', {
        p_amount_minor: Math.round(majorUnits * 100),
        p_extend_days: days,
        p_member_id: target.id,
        p_method: method,
        p_notes: 'Quick renew from front desk',
        p_tenant_id: tenantId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      onClose();
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-renew-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/70 bg-surface p-6 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="quick-renew-title" className="text-lg font-bold text-white">
              ⚡ Quick Renew
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {target.fullName} · {target.memberCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-5">
          <label htmlFor="renew-amount" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Amount ({currency})
          </label>
          <input
            id="renew-amount"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-border/70 bg-surface-elevated px-3 text-base text-white focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10"
          />
          {target.lastAmountMinor ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Pre-filled from the member’s last payment.
            </p>
          ) : null}
        </div>

        <fieldset className="mt-4">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Extend by
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                className={`h-10 rounded-xl border text-xs font-semibold transition ${
                  days === option.days
                    ? 'border-accent/60 bg-accent/15 text-accent'
                    : 'border-border/70 bg-surface-elevated text-slate-400 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => renew('cash')}
            className="h-12 rounded-xl border border-success/30 bg-success/10 text-sm font-bold text-success transition hover:bg-success/20 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing…' : 'Renew · Cash'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => renew('upi')}
            className="h-12 rounded-xl border border-accent/30 bg-accent/10 text-sm font-bold text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing…' : 'Renew · UPI'}
          </button>
        </div>
      </div>
    </div>
  );
}
