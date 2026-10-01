import { Wallet } from 'lucide-react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';

/**
 * Shift Float Status — how much cash the drawer should physically hold.
 *
 * Opening Float is the float the desk started the shift with. Expected Cash is
 * opening, plus cash settled since, less anything paid out of the drawer.
 *
 * The reconciliation vocabulary is deliberately absent: at a gym counter a
 * "short" or a "variance" reads as an accusation levelled at whoever is on the
 * desk, and this card only ever reports a state, never a judgement. Counting
 * the drawer and closing the shift both live on `/owner/staff`, where the
 * numbers are attached to a person who can explain them.
 */
export function ShiftFloatCard({
  expectedMinor,
  hasShift,
  openingMinor,
  varianceMinor,
}: {
  expectedMinor: number;
  hasShift: boolean;
  openingMinor: number;
  varianceMinor: number | null;
}) {
  const balanced = hasShift && varianceMinor === 0;

  const pill = !hasShift
    ? { label: copy.home.noShiftFloat, tone: 'border-border/70 bg-surface-elevated text-slate-400' }
    : balanced
      ? { label: copy.home.balanced, tone: 'border-success/25 bg-success/10 text-success' }
      : { label: copy.home.active, tone: 'border-accent/25 bg-accent/10 text-accent' };

  return (
    <section
      data-testid="shift-float-card"
      aria-labelledby="float-heading"
      className="overflow-hidden rounded-2xl border border-border/70 bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <h2 id="float-heading" className="font-bold text-white">
          {copy.home.floatTitle}
        </h2>
        <span
          data-testid="float-status-pill"
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${pill.tone}`}
        >
          {pill.label}
        </span>
      </div>

      <dl className="divide-y divide-border/50">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <dt className="flex items-center gap-2 text-sm text-slate-400">
            <Wallet aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
            {copy.home.openingFloat}
          </dt>
          <dd
            data-testid="float-opening"
            className="text-sm font-semibold tabular-nums text-white"
          >
            {formatMoney(openingMinor)}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <dt className="text-sm text-slate-400">{copy.home.expectedCash}</dt>
          <dd
            data-testid="float-expected"
            className="text-sm font-semibold tabular-nums text-white"
          >
            {formatMoney(expectedMinor)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
