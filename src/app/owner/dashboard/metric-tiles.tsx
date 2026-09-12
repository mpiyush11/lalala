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

/** Shared shell so a linked tile and a static tile are visually identical. */
const TILE =
  'block rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-zinc-100 transition';

function Tile({
  label,
  sub,
  testId,
  value,
}: {
  label: string;
  sub?: string;
  testId: string;
  value: string;
}) {
  return (
    <div data-testid={testId} className={TILE}>
      <p className="truncate text-xs text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-semibold tabular-nums text-zinc-100">
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

/**
 * The four numbers an owner opens the app to see.
 *
 * Read-only by design: this screen is a business monitor, not a control panel.
 * Anything that needs a decision lives on its own tab, which is why the dues
 * tile is the one tile that navigates.
 */
export function MetricTiles({ metrics }: { metrics: CockpitMetrics }) {
  return (
    <section
      data-testid="metric-tiles"
      aria-label={copy.home.totalRevenue}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <Tile
        testId="metric-revenue"
        label={copy.home.totalRevenue}
        value={formatMoney(metrics.revenueTodayMinor)}
      />
      <Tile
        testId="metric-cash"
        label={copy.home.cashDrawer}
        value={formatMoney(metrics.cashDrawerMinor)}
      />
      <Tile
        testId="metric-upi"
        label={copy.home.bankUpi}
        value={formatMoney(metrics.bankUpiTodayMinor)}
      />

      {/* The only actionable tile: dues are work, the rest are facts. */}
      <Link
        href="/owner/dues"
        data-testid="metric-dues"
        className={`${TILE} hover:border-zinc-700`}
      >
        <p className="truncate text-xs text-zinc-500">{copy.home.pendingDues}</p>
        <p className="mt-1 truncate font-mono text-xl font-semibold tabular-nums text-zinc-100">
          {formatMoney(metrics.duesTotalMinor)}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
          {metrics.duesCount} member{metrics.duesCount === 1 ? '' : 's'} →
        </p>
      </Link>
    </section>
  );
}
