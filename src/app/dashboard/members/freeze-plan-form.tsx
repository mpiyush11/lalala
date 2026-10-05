'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatDateKey } from '@/lib/format/expiry';
import { createClient } from '@/lib/supabase/client';

const REASONS = [
  'Medical / Injury',
  'Travel / Relocation',
  'Exams / Academic',
  'Personal',
] as const;

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Membership freeze form.
 *
 * Only offered for ACTIVE members — the server rejects freezing an expired or
 * already-paused plan, so the UI mirrors that rather than letting the desk
 * submit a doomed request.
 */
export function FreezePlanForm({
  currentExpiry,
  memberId,
  status,
  tenantId,
  todayKey,
}: {
  currentExpiry: string;
  memberId: string;
  status: string;
  tenantId: string;
  todayKey: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [resumeDate, setResumeDate] = useState(() => addDays(todayKey, 14));
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFreeze = status === 'active';
  const frozenDays = dayDiff(startDate, resumeDate);
  const maxResume = addDays(startDate, 30);
  const newExpiry = frozenDays > 0 ? addDays(currentExpiry, frozenDays) : currentExpiry;
  const isValidRange = frozenDays > 0 && frozenDays <= 30;

  async function submit() {
    if (isSaving || !isValidRange) return;

    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('freeze_member_plan', {
        p_freeze_start: startDate,
        p_member_id: memberId,
        p_reason: reason,
        p_resume_on: resumeDate,
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

  if (!isOpen) {
    return (
      <button
        type="button"
        disabled={!canFreeze}
        onClick={() => setIsOpen(true)}
        data-testid="freeze-trigger"
        title={canFreeze ? 'Pause this membership' : 'Only active memberships can be frozen'}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 text-sm font-bold text-amber-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⏸ Pause / Freeze Plan
      </button>
    );
  }

  return (
    <div
      data-testid="freeze-form"
      className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-amber-300">⏸ Freeze membership</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Cancel freeze"
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg text-slate-400 active:scale-[0.98]"
        >
          ✕
        </button>
      </div>

      <label htmlFor="freeze-start" className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-slate-300">Freeze start date</span>
        <input
          id="freeze-start"
          type="date"
          min={todayKey}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="h-12 min-h-[44px] w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 text-base text-white outline-none focus:border-accent"
        />
      </label>

      <label htmlFor="freeze-resume" className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-slate-300">
          Auto-resume date <span className="text-slate-500">(max 30 days)</span>
        </span>
        <input
          id="freeze-resume"
          type="date"
          min={addDays(startDate, 1)}
          max={maxResume}
          value={resumeDate}
          onChange={(event) => setResumeDate(event.target.value)}
          className="h-12 min-h-[44px] w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 text-base text-white outline-none focus:border-accent"
        />
      </label>

      <label htmlFor="freeze-reason" className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-slate-300">Reason for freeze</span>
        <select
          id="freeze-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-12 min-h-[44px] w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 text-base text-white outline-none focus:border-accent"
        >
          {REASONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <p
        data-testid="freeze-preview"
        className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
          isValidRange ? 'bg-zinc-800 text-slate-300' : 'bg-danger/10 text-red-200'
        }`}
      >
        {isValidRange
          ? `Membership will freeze for ${frozenDays} days. New expiry date will extend to: ${formatDateKey(newExpiry)}`
          : 'Resume date must be 1–30 days after the freeze start date.'}
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={isSaving || !isValidRange}
        data-testid="freeze-submit"
        className="mt-3 inline-flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-amber-400 text-sm font-bold text-zinc-950 transition active:scale-[0.98] disabled:opacity-50"
      >
        {isSaving ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
            Freezing…
          </>
        ) : (
          'Confirm Freeze'
        )}
      </button>
    </div>
  );
}
