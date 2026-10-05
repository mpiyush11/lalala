import { AlertTriangle, Banknote, QrCode, TrendingUp, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';

export type CockpitMetrics = {
  bankUpiTodayMinor: number;
  cashDrawerMinor: number;
  duesCount: number;
  duesTotalMinor: number;
  revenueTodayMinor: number;
};

/**
 * Shared surface so a linked tile and a static tile read as the same object.
 *
 * Mirrors the reception dashboard's `StatCard` verbatim: `bg-surface`
 * (#1E1E2E) sits a step ABOVE the `bg-canvas` shell behind a `#3C494C`
 * hairline. The previous inverted scheme put a near-black card on a #121212
 * shell, which is what left the panel reading as one muddy field.
 */
const TILE =
  'flex min-w-0 flex-col rounded-2xl border border-border/70 bg-surface p-5 shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-card-lift';

/**
 * Card label — the reception token, `text-sm font-medium text-slate-400`.
 *
 * Wraps rather than truncates: these four strings are the owner's vocabulary
 * for the business, and a clipped half-word reads as a rendering fault.
 */
const LABEL = 'text-sm font-medium leading-tight text-slate-400';

/**
 * The headline figure.
 *
 * Tabular numerals so the four tiles align digit-for-digit in the 2x2 grid.
 */
const FIGURE = 'mt-3 truncate text-3xl font-bold tracking-tight tabular-nums text-white';

/** Accent badge: the only colour on an otherwise monochrome card. */
const BADGE = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl border';

/**
 * One hue per meaning, matching the reception `StatCard` accent map.
 *   success — money in
 *   accent  — where the money is (drawer, bank)
 *   danger  — money owed
 */
const TONES = {
  accent: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  success: 'border-success/25 bg-success/10 text-success',
} as const;

type Tone = keyof typeof TONES;

function Tile({
  icon: Icon,
  label,
  testId,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  testId: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div data-testid={testId} className={TILE}>
      <div className="flex items-start justify-between gap-3">
        <p className={LABEL}>{label}</p>
        <div className={`${BADGE} ${TONES[tone]}`}>
          <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
      <p className={FIGURE}>{value}</p>
    </div>
  );
}

/**
 * The four numbers an owner opens the app to see.
 *
 * Read-only by design: this screen is a business monitor, not a control panel.
 * Anything that needs a decision lives on its own tab, which is why the dues
 * tile is the only one that navigates — and why it is the only one that carries
 * a press affordance.
 */
export function MetricTiles({ metrics }: { metrics: CockpitMetrics }) {
  return (
    <section
      data-testid="metric-tiles"
      aria-label={copy.home.totalRevenue}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4"
    >
      <Tile
        icon={TrendingUp}
        testId="metric-revenue"
        tone="success"
        label={copy.home.totalRevenue}
        value={formatMoney(metrics.revenueTodayMinor)}
      />
      <Tile
        icon={Banknote}
        testId="metric-cash"
        tone="accent"
        label={copy.home.cashDrawer}
        value={formatMoney(metrics.cashDrawerMinor)}
      />
      <Tile
        icon={QrCode}
        testId="metric-upi"
        tone="accent"
        label={copy.home.bankUpi}
        value={formatMoney(metrics.bankUpiTodayMinor)}
      />

      {/* The one actionable tile. The arrow and the press-scale are the only
          signals that distinguish a destination from a fact, so both stay. */}
      <Link
        href="/owner/dues"
        data-testid="metric-dues"
        className={`${TILE} group active:scale-[0.98]`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={LABEL}>{copy.home.pendingDues}</p>
          <div className={`${BADGE} ${TONES.danger}`}>
            <AlertTriangle aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </div>
        </div>
        <p className={FIGURE}>{formatMoney(metrics.duesTotalMinor)}</p>
        <p className="mt-auto flex items-center gap-1 truncate pt-1.5 text-[10px] font-medium text-slate-400">
          <span className="truncate">{copy.home.tapToView}</span>
          <span
            aria-hidden="true"
            className="shrink-0 transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </p>
      </Link>
    </section>
  );
}
