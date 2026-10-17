import { Inbox } from 'lucide-react';
import Link from 'next/link';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';

export type CollectionEntry = {
  amountMinor: number;
  id: string;
  memberName: string;
  /** Raw ISO instant, used only for ordering. */
  occurredAt: string;
  staffName: string;
  tender: 'CASH' | 'UPI' | 'SPLIT';
  time: string;
};

export type ExpenseEntry = {
  amountMinor: number;
  category: string;
  id: string;
  note: string | null;
  /** Raw ISO instant, used only for ordering. */
  occurredAt: string;
  staffName: string;
  time: string;
};

/** One shape for both sides of the ledger, so they can share a table. */
type LedgerRow = {
  amountMinor: number;
  direction: 'in' | 'out';
  id: string;
  label: string;
  occurredAt: string;
  staffName: string;
  tag: string;
  time: string;
};

/**
 * Three columns on a phone, five from `sm` up.
 *
 * Tender and Staff are `display:none` below `sm`, which removes them from the
 * grid entirely rather than leaving a gap — so the remaining three children
 * fill the three-column template with no reordering. At 360px five columns
 * would each be under 60px, narrower than a timestamp.
 */
const GRID =
  'grid items-center gap-3 grid-cols-[64px_minmax(0,1fr)_auto] sm:grid-cols-[68px_minmax(0,1fr)_76px_minmax(0,1fr)_104px]';

function toRows(collections: CollectionEntry[], expenses: ExpenseEntry[]): LedgerRow[] {
  const inflow: LedgerRow[] = collections.map((entry) => ({
    amountMinor: entry.amountMinor,
    direction: 'in',
    id: `c-${entry.id}`,
    label: entry.memberName,
    occurredAt: entry.occurredAt,
    staffName: entry.staffName,
    tag: entry.tender,
    time: entry.time,
  }));

  const outflow: LedgerRow[] = expenses.map((entry) => ({
    amountMinor: entry.amountMinor,
    direction: 'out',
    id: `e-${entry.id}`,
    label: entry.note
      ? `${copy.expenses.categories[entry.category] ?? entry.category} · ${entry.note}`
      : (copy.expenses.categories[entry.category] ?? entry.category),
    occurredAt: entry.occurredAt,
    staffName: entry.staffName,
    tag: 'OUT',
    time: entry.time,
  }));

  // Newest first, ordered on the raw instant. Sorting the rendered 12-hour
  // string silently misorders across noon — "10:42 am" compares above
  // "09:42 pm" — which is exactly the kind of quiet wrongness a cash log
  // cannot carry.
  return [...inflow, ...outflow].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Today's realtime audit log.
 *
 * Money in and money out were previously two separate cards, each collapsing
 * to a tall empty box with one line of grey text — a pair of dead wireframes
 * for most of the morning. They are one ledger now: the same rows the front
 * desk sees, sorted newest-first, with direction carried by a signed amount
 * rather than by which box a row happens to sit in.
 */
export function RealtimeAuditLog({
  collections,
  expenses,
}: {
  collections: CollectionEntry[];
  expenses: ExpenseEntry[];
}) {
  const rows = toRows(collections, expenses);

  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-surface"
      aria-labelledby="audit-heading"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <h2 id="audit-heading" className="font-bold text-white">
          {copy.home.auditTitle}
        </h2>
        {rows.length ? (
          <Link
            href="/owner/staff"
            data-testid="view-shift-log"
            className="shrink-0 text-xs text-slate-500 transition hover:text-slate-300"
          >
            {copy.home.viewShiftLog}
          </Link>
        ) : null}
      </div>

      {rows.length ? (
        <div data-testid="audit-log">
          <div
            className={`${GRID} hidden border-b border-border/60 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:grid`}
          >
            <span>{copy.home.colTime}</span>
            <span>{copy.home.colDescription}</span>
            <span>{copy.home.colTender}</span>
            <span>{copy.home.colStaff}</span>
            <span className="text-right">{copy.home.colAmount}</span>
          </div>

          <ul className="divide-y divide-border/50">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="audit-row"
                data-direction={row.direction}
                className={`${GRID} px-5 py-3 transition-colors hover:bg-surface-elevated/40`}
              >
                <span className="font-mono text-[11px] tabular-nums text-slate-500">
                  {row.time}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-200">
                    {row.label}
                  </span>
                  {/* Staff rides under the description on a phone, where it has
                      no column of its own. */}
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500 sm:hidden">
                    {row.staffName}
                  </span>
                </span>

                <span className="hidden sm:block">
                  <span
                    data-testid="tender-badge"
                    className="inline-block shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                  >
                    {row.tag}
                  </span>
                </span>

                <span className="hidden truncate text-xs text-slate-500 sm:block">
                  {row.staffName}
                </span>

                <span
                  className={`text-right text-sm font-bold tabular-nums ${
                    row.direction === 'in' ? 'text-success' : 'text-slate-400'
                  }`}
                >
                  {row.direction === 'in' ? '+' : '−'}
                  {formatMoney(row.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* Executive empty state: an intentional destination, not a shrunken
           version of the populated card. It explains what will appear here
           rather than just reporting that nothing has. */
        <div
          data-testid="audit-empty"
          className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center"
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-full border border-border/70 bg-surface-elevated text-slate-500"
          >
            <Inbox className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="max-w-sm text-sm text-slate-400">{copy.home.auditEmptyExecutive}</p>
        </div>
      )}
    </section>
  );
}
