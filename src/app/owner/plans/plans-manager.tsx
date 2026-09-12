'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/client';

export type PlanRow = {
  durationMonths: number;
  id: string;
  isActive: boolean;
  name: string;
  priceMinor: number;
};

type Draft = {
  durationMonths: string;
  /** Null when adding a new plan. */
  id: string | null;
  name: string;
  priceMajor: string;
};

const EMPTY: Draft = { durationMonths: '1', id: null, name: '', priceMajor: '' };

/**
 * Master pricing controller.
 *
 * Writes go straight to `membership_plans`, which RLS restricts to the owner —
 * a receptionist who could edit prices could discount a membership and pocket
 * the difference. Reception reads the same table on every render, so a saved
 * price is live at the counter immediately with no deploy.
 */
export function PlansManager({ plans, tenantId }: { plans: PlanRow[]; tenantId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDraft(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [draft]);

  const months = Number(draft?.durationMonths ?? 0);
  const priceMajor = Number(draft?.priceMajor ?? 0);
  const canSave =
    !!draft &&
    draft.name.trim().length >= 1 &&
    Number.isFinite(months) &&
    months >= 1 &&
    Number.isFinite(priceMajor) &&
    priceMajor >= 0;

  async function save() {
    if (!draft || busy || !canSave) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const payload = {
        duration_months: Math.round(months),
        name: draft.name.trim(),
        price_minor: Math.round(priceMajor * 100),
      };

      // RLS re-checks tenant + owner role on the server; sending tenant_id here
      // only satisfies the NOT NULL column, it is not what authorises the write.
      const { error: writeError } = draft.id
        ? await supabase.from('membership_plans').update(payload).eq('id', draft.id)
        : await supabase.from('membership_plans').insert({ ...payload, tenant_id: tenantId });

      if (writeError) {
        setError(writeError.message);
        setBusy(false);
        return;
      }

      setBusy(false);
      setDraft(null);
      router.refresh();
    } catch {
      setError(copy.common.networkError);
      setBusy(false);
    }
  }

  async function toggleActive(plan: PlanRow) {
    if (busyId) return;
    setBusyId(plan.id);
    setError(null);

    try {
      const supabase = createClient();
      const { error: writeError } = await supabase
        .from('membership_plans')
        .update({ is_active: !plan.isActive })
        .eq('id', plan.id);

      if (writeError) setError(writeError.message);
      setBusyId(null);
      router.refresh();
    } catch {
      setError(copy.common.networkError);
      setBusyId(null);
    }
  }

  const field =
    'h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-600';

  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{copy.plans.subtitle}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setError(null);
          }}
          data-testid="add-plan-btn"
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-zinc-700 px-3 text-xs text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          {copy.plans.addPlan}
        </button>
      </div>

      {plans.length ? (
        <ul data-testid="plans-list">
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-testid="plan-row"
              data-plan-active={plan.isActive ? 'true' : 'false'}
              className="flex h-[50px] min-w-0 items-center gap-3 border-b border-zinc-800/60"
            >
              <span className="min-w-0 flex-1 truncate">
                <span
                  data-testid="plan-name"
                  className={`text-[15px] font-semibold ${plan.isActive ? 'text-zinc-100' : 'text-zinc-500'}`}
                >
                  {plan.name}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {copy.plans.durationMonths(plan.durationMonths)}
                </span>
              </span>

              <span
                data-testid="plan-price"
                className="shrink-0 font-mono text-base font-bold tabular-nums text-zinc-100"
              >
                {formatMoney(plan.priceMinor)}
              </span>

              <button
                type="button"
                disabled={busyId === plan.id}
                onClick={() => toggleActive(plan)}
                data-testid="plan-toggle"
                className="inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-700 px-3 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
              >
                {plan.isActive ? copy.plans.deactivate : copy.plans.reactivate}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraft({
                    durationMonths: String(plan.durationMonths),
                    id: plan.id,
                    name: plan.name,
                    priceMajor: String(Math.round(plan.priceMinor / 100)),
                  });
                  setError(null);
                }}
                data-testid="plan-edit"
                data-plan-id={plan.id}
                className="inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-700 px-3 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
              >
                {copy.plans.edit}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="plans-empty" className="py-2 text-xs text-zinc-500">
          {copy.plans.empty}
        </p>
      )}

      {error && !draft ? (
        <p role="alert" className="mt-2 text-xs text-amber-500/90">
          {error}
        </p>
      ) : null}

      {draft ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label={copy.common.cancel}
            onClick={() => setDraft(null)}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-dialog-title"
            data-testid="plan-dialog"
            className="animate-sheet-up relative w-full rounded-t-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-xl"
          >
            <h3 id="plan-dialog-title" className="text-base font-semibold text-zinc-100">
              {draft.id ? copy.plans.editTitle : copy.plans.newTitle}
            </h3>

            <label htmlFor="plan-name-input" className="mt-4 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.plans.modalName}</span>
              <input
                id="plan-name-input"
                type="text"
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. 3 Months"
                data-testid="plan-name-input"
                className={field}
              />
            </label>

            <label htmlFor="plan-months-input" className="mt-3 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.plans.modalDuration}</span>
              <input
                id="plan-months-input"
                type="text"
                inputMode="numeric"
                value={draft.durationMonths}
                onChange={(event) =>
                  setDraft({ ...draft, durationMonths: event.target.value.replace(/[^\d]/g, '') })
                }
                data-testid="plan-months-input"
                className={field}
              />
            </label>

            <label htmlFor="plan-price-input" className="mt-3 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.plans.modalPrice}</span>
              <input
                id="plan-price-input"
                type="text"
                inputMode="numeric"
                value={draft.priceMajor}
                onChange={(event) =>
                  setDraft({ ...draft, priceMajor: event.target.value.replace(/[^\d]/g, '') })
                }
                data-testid="plan-price-input"
                className={field}
              />
            </label>

            {error ? (
              <p role="alert" data-testid="plan-error" className="mt-3 text-xs text-amber-500/90">
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDraft(null)}
                data-testid="plan-cancel"
                className="h-10 rounded-lg border border-zinc-800 text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                {copy.plans.modalCancel}
              </button>
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={save}
                data-testid="plan-save"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {busy ? copy.plans.modalSaving : copy.plans.modalSave}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
