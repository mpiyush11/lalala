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
  isActive: boolean;
  name: string;
  priceMajor: string;
};

/**
 * True when the duration line says something the plan name does not.
 *
 * "1 Month" over "1 month" is the same fact twice and reads like a rendering
 * bug; "1 Year" over "12 months" is genuinely useful.
 */
function durationAddsInfo(plan: PlanRow): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Compare against the string actually rendered, which is singular at 1.
  return normalise(plan.name) !== normalise(copy.plans.durationMonths(plan.durationMonths));
}

const EMPTY: Draft = {
  durationMonths: '1',
  id: null,
  isActive: true,
  name: '',
  priceMajor: '',
};

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
        is_active: draft.isActive,
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

  const field =
    'h-10 w-full rounded-xl border border-border/70 bg-surface-elevated px-3.5 text-sm text-white outline-none placeholder-slate-500 focus:border-accent';

  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{copy.plans.subtitle}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setError(null);
          }}
          data-testid="add-plan-btn"
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-accent/40 bg-accent/15 px-3 text-xs text-accent transition hover:bg-accent/25"
        >
          {copy.plans.addPlan}
        </button>
      </div>

      {plans.length ? (
        <ul
          data-testid="plans-list"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-testid="plan-row"
              data-plan-active={plan.isActive ? 'true' : 'false'}
              className={`card-lift flex min-w-0 flex-col justify-between rounded-2xl border border-border/70 bg-surface p-6 shadow-lg shadow-black/20 ${
                plan.isActive ? '' : 'opacity-60'
              }`}
            >
              <div>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span
                    data-testid="plan-name"
                    className="min-w-0 truncate text-lg font-bold text-white"
                  >
                    {plan.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-slate-300">
                    {copy.plans.durationMonths(plan.durationMonths)}
                  </span>
                </div>

                {plan.isActive ? null : (
                  <span
                    data-testid="plan-inactive-badge"
                    className="mt-3 inline-block shrink-0 whitespace-nowrap rounded border border-border/70 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-400"
                  >
                    {copy.plans.inactive}
                  </span>
                )}
                <p
                  data-testid="plan-price"
                  className="mt-4 truncate text-3xl font-extrabold tracking-tight tabular-nums text-white"
                >
                  {formatMoney(plan.priceMinor)}
                </p>
                {durationAddsInfo(plan) ? (
                  <p className="mt-1 truncate text-xs text-slate-400">
                    / {copy.plans.durationMonths(plan.durationMonths)}
                  </p>
                ) : null}
              </div>

              {/* ONE control. Activation moved into the sheet: two competing
                  buttons left neither with a comfortable target and made the
                  destructive one as prominent as the safe one. The test suite
                  asserts exactly one control per plan-row. */}
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    durationMonths: String(plan.durationMonths),
                    id: plan.id,
                    isActive: plan.isActive,
                    name: plan.name,
                    priceMajor: String(Math.round(plan.priceMinor / 100)),
                  });
                  setError(null);
                }}
                data-testid="plan-edit"
                data-plan-id={plan.id}
                className="mt-6 w-full rounded-xl border border-border/70 bg-surface-elevated py-2.5 text-center font-medium text-accent transition hover:border-accent"
              >
                {copy.plans.edit}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="plans-empty" className="py-2 text-xs text-slate-500">
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
            className="animate-sheet-up relative w-full rounded-t-xl border border-border/70 bg-surface p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-xl"
          >
            <h3 id="plan-dialog-title" className="text-base font-semibold text-white">
              {draft.id ? copy.plans.editTitle : copy.plans.newTitle}
            </h3>

            <label htmlFor="plan-name-input" className="mt-4 block">
              <span className="mb-1.5 block text-sm text-slate-400">{copy.plans.modalName}</span>
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
              <span className="mb-1.5 block text-sm text-slate-400">{copy.plans.modalDuration}</span>
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
              <span className="mb-1.5 block text-sm text-slate-400">{copy.plans.modalPrice}</span>
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

            {/* Activation lives here, below the fields and above the save —
                reachable in one tap from the row, but never competing with
                Edit for space on a narrow row. Existing plans only: a plan
                being created is active by definition. */}
            {draft.id ? (
              <div className="mt-4 flex items-start justify-between gap-3 border-t border-border/70 pt-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-300">{copy.plans.activeLabel}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {draft.isActive ? copy.plans.activeHint : copy.plans.inactiveHint}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.isActive}
                  aria-label={copy.plans.activeLabel}
                  onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                  data-testid="plan-active-toggle"
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    draft.isActive ? 'bg-emerald-600' : 'bg-surface-elevated'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      draft.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ) : null}

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
                className="h-10 rounded-lg border border-border/70 text-sm text-slate-300 transition hover:text-white"
              >
                {copy.plans.modalCancel}
              </button>
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={save}
                data-testid="plan-save"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:opacity-40"
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
