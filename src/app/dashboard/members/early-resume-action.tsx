'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatDateKey } from '@/lib/format/expiry';
import { createClient } from '@/lib/supabase/client';

function dayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Early resume with a mandatory confirmation step.
 *
 * Resuming mutates the expiry date, so a single stray tap must never commit it.
 * The preview mirrors the server's rollback maths: unused frozen days are
 * subtracted from the expiry that the freeze had extended.
 */
export function EarlyResumeAction({
  currentExpiry,
  freezeStartedOn,
  freezeResumesOn,
  memberId,
  status,
  tenantId,
  todayKey,
}: {
  currentExpiry: string;
  freezeStartedOn: string | null;
  freezeResumesOn: string | null;
  memberId: string;
  status: string;
  tenantId: string;
  todayKey: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (status !== 'paused' || !freezeStartedOn || !freezeResumesOn) return null;

  const planned = dayDiff(freezeStartedOn, freezeResumesOn);
  const actual = Math.max(0, Math.min(dayDiff(freezeStartedOn, todayKey), planned));
  const unused = Math.max(0, planned - actual);
  const newExpiry = addDays(currentExpiry, -unused);

  async function confirm() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('resume_member_early', {
        p_member_id: memberId,
        p_tenant_id: tenantId,
      });

      if (rpcError) {
        setError(rpcError.message);
        setIsSaving(false);
        return;
      }

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
        data-testid="early-resume-trigger"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-success/15 px-4 text-sm font-bold text-success transition active:scale-[0.98]"
      >
        ▶ Resume Membership Early
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cancel resume"
            onClick={() => setIsOpen(false)}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
          />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="resume-title"
            data-testid="resume-confirm-dialog"
            className="animate-sheet-up relative w-full rounded-t-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-2xl"
          >
            <div aria-hidden="true" className="mb-3 flex justify-center sm:hidden">
              <span className="h-1.5 w-10 rounded-full bg-zinc-700" />
            </div>

            <h3 id="resume-title" className="text-base font-bold text-white">
              Resume Membership Early?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-300" data-testid="resume-confirm-body">
              Member was scheduled to resume on{' '}
              <strong className="text-white">{formatDateKey(freezeResumesOn)}</strong>. Resuming
              today will adjust their expiry date to{' '}
              <strong className="text-amber-300">{formatDateKey(newExpiry)}</strong>. Are you sure?
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Used {actual} of {planned} frozen days · {unused} unused day
              {unused === 1 ? '' : 's'} rolled back.
            </p>

            {error ? (
              <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-red-200">
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                data-testid="resume-cancel"
                className="min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-semibold text-slate-300 transition active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isSaving}
                data-testid="resume-confirm"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-bold text-zinc-950 transition active:scale-[0.98] disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                    Resuming…
                  </>
                ) : (
                  'Confirm & Reactivate'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
