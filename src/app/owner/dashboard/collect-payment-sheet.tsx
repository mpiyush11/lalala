'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/client';

export type CollectTarget = {
  balanceMinor: number;
  fullName: string;
  id: string;
  /** The open payment row this balance belongs to. */
  pendingPaymentId: string;
  /** Preserved when a partial amount is taken. */
  promisedOn?: string | null;
};

/**
 * Focused settlement sheet — bottom sheet on phones, centred modal on desktop.
 *
 * Shared by the dues list and quick search so a payment is collected the same
 * way wherever the owner finds the member, and the `collect_split_payment`
 * contract only has one call site to keep correct.
 */
export function CollectPaymentSheet({
  onClose,
  target,
  tenantId,
}: {
  onClose: () => void;
  target: CollectTarget;
  tenantId: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(Math.round(target.balanceMinor / 100)));
  const [mode, setMode] = useState<'cash' | 'upi'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const takingMinor = Math.round(Number(amount || 0) * 100);

  async function settle() {
    if (busy || !Number.isFinite(takingMinor) || takingMinor <= 0) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('collect_split_payment', {
        p_cash_minor: mode === 'cash' ? takingMinor : 0,
        // A partial payment must keep a settlement date; the server rejects it
        // otherwise. Clearing the balance drops the date entirely.
        p_due_settlement_date:
          takingMinor < target.balanceMinor ? (target.promisedOn ?? null) : null,
        p_member_id: target.id,
        p_pending_payment_id: target.pendingPaymentId,
        p_tenant_id: tenantId,
        p_total_due_minor: target.balanceMinor,
        p_upi_minor: mode === 'upi' ? takingMinor : 0,
      });

      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        return;
      }

      setBusy(false);
      onClose();
      router.refresh();
    } catch {
      setError(copy.common.networkError);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={copy.common.cancel}
        onClick={onClose}
        className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collect-title"
        data-testid="collect-dialog"
        className="animate-sheet-up relative w-full rounded-t-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-xl"
      >
        <div aria-hidden="true" className="mb-3 flex justify-center sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>

        <h3 id="collect-title" className="text-base font-semibold text-zinc-100">
          {copy.dues.collectTitle(target.fullName)}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {copy.dues.collectBalance(formatMoney(target.balanceMinor))}
        </p>

        <label htmlFor="collect-amount" className="mt-4 block">
          <span className="mb-1.5 block text-sm text-zinc-400">
            {copy.dues.collectAmount}
          </span>
          <input
            id="collect-amount"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
            data-testid="collect-amount"
            className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-600"
          />
        </label>

        <div
          role="radiogroup"
          aria-label={copy.dues.collectAmount}
          className="mt-3 flex rounded-lg border border-zinc-800 p-1"
        >
          {(['cash', 'upi'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => setMode(option)}
              data-testid={`collect-mode-${option}`}
              className={`h-9 flex-1 rounded-md text-sm transition active:scale-[0.98] ${
                mode === option ? 'bg-zinc-800 font-medium text-zinc-100' : 'text-zinc-500'
              }`}
            >
              {option === 'cash' ? copy.dues.modeCash : copy.dues.modeUpi}
            </button>
          ))}
        </div>

        <label htmlFor="collect-note" className="mt-3 block">
          <span className="mb-1.5 block text-sm text-zinc-400">
            {copy.dues.collectNote}{' '}
            <span className="text-zinc-500">{copy.dues.collectNoteOptional}</span>
          </span>
          <input
            id="collect-note"
            type="text"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.dues.collectNotePlaceholder}
            data-testid="collect-note"
            className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-600"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-3 text-xs text-amber-500/90"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="collect-cancel"
            className="h-10 rounded-lg border border-zinc-800 text-sm text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {copy.dues.collectCancel}
          </button>
          <button
            type="button"
            disabled={busy || takingMinor <= 0}
            onClick={settle}
            data-testid="collect-confirm"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? copy.dues.collectSaving : copy.dues.collectConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
