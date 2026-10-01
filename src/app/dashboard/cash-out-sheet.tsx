'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AmountField } from '@/components/form-inputs';
import { createClient } from '@/lib/supabase/client';

const CATEGORIES = [
  { label: 'Water Camper', value: 'water_camper' },
  { label: 'Housekeeping / Supplies', value: 'housekeeping' },
  { label: 'Staff Advance', value: 'staff_advance' },
  { label: 'Repairs', value: 'repairs' },
  { label: 'Other', value: 'other' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

/**
 * Petty-cash drawer cash-out.
 *
 * Mobile renders a ~50vh bottom sheet with a drag handle; desktop renders a
 * centered modal. Staff identity and timestamp are attached server-side from
 * the authenticated session, never from client input.
 */
export function CashOutSheet({
  staffId,
  tenantId,
}: {
  staffId: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('water_camper');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setError(null);
  }

  async function submit() {
    if (isSaving) return;

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from('expenses').insert({
        amount_minor: Math.round(value * 100),
        category,
        note: note.replace(/\s+/g, ' ').trim() || null,
        recorded_by: staffId,
        tenant_id: tenantId,
      });

      if (insertError) {
        setError(insertError.message);
        setIsSaving(false);
        return;
      }

      setAmount('');
      setNote('');
      setIsOpen(false);
      setIsSaving(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        data-testid="cash-out-trigger"
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-300 transition active:scale-[0.98] sm:min-h-0 sm:h-10"
      >
        − Cash Out / Expense
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close cash out"
            onClick={close}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-out-title"
            data-testid="cash-out-dialog"
            className="animate-sheet-up relative flex h-[50vh] w-full flex-col rounded-t-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl sm:h-auto sm:max-w-md sm:animate-none sm:rounded-2xl"
          >
            <div aria-hidden="true" className="flex shrink-0 justify-center pt-2.5 sm:hidden">
              <span className="h-1.5 w-10 rounded-full bg-zinc-700" />
            </div>

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h2 id="cash-out-title" className="text-base font-bold text-white">
                  − Cash Out / Expense
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Deducted from today’s drawer</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-zinc-700/80 bg-zinc-950/60 text-slate-300 transition active:scale-[0.98] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
              <AmountField
                currency="INR"
                id="expense-amount"
                label="Amount"
                onChange={setAmount}
                value={amount}
              />

              <label htmlFor="expense-category" className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  Category / Reason
                </span>
                <select
                  id="expense-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Category)}
                  className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent"
                >
                  {CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="expense-note" className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  Custom note <span className="text-slate-500">(optional)</span>
                </span>
                <input
                  id="expense-note"
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={(event) => setNote(event.target.value.replace(/\s+/g, ' ').trim())}
                  placeholder="e.g. Two 20L campers"
                  className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-accent"
                />
              </label>

              {error ? (
                <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-zinc-800 p-3">
              <button
                type="button"
                onClick={submit}
                disabled={isSaving}
                data-testid="cash-out-submit"
                className="inline-flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-zinc-950 transition active:scale-[0.98] disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                    Recording…
                  </>
                ) : (
                  'Record Expense'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
