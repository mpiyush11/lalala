'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ClampedList } from '@/components/clamped-list';
import { formatMoney } from '@/lib/format/currency';
import { formatTimestampDate } from '@/lib/format/expiry';

export type InflowRow = {
  amountMinor: number;
  cashMinor: number;
  currency: string;
  id: string;
  memberCode: string;
  memberName: string;
  method: string;
  notes: string | null;
  paidAt: string | null;
  upiMinor: number;
};

export type OutflowRow = {
  amountMinor: number;
  category: string;
  id: string;
  note: string | null;
  spentAt: string;
  staffName: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  housekeeping: 'Housekeeping',
  other: 'Other',
  repairs: 'Repairs',
  staff_advance: 'Staff Advance',
  water_camper: 'Water Camper',
};

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Payments hub with an inflow / outflow segmented view.
 *
 * Cash-out history previously had no surface at all, so a receptionist could
 * not reconcile the drawer against recorded expenses.
 */
export function PaymentsHub({
  currency,
  inflow,
  initialTab = 'in',
  outflow,
  timeZone,
}: {
  currency: string;
  inflow: InflowRow[];
  /** Deep-linked from the dashboard Net Drawer tile (?tab=outflow). */
  initialTab?: 'in' | 'out';
  outflow: OutflowRow[];
  timeZone: string;
}) {
  const [tab, setTab] = useState<'in' | 'out'>(initialTab);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/60">
      <div className="border-b border-zinc-800 p-3">
        <div
          role="tablist"
          aria-label="Ledger direction"
          data-testid="flow-tabs"
          className="flex rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'in'}
            onClick={() => setTab('in')}
            data-testid="tab-inflow"
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] ${
              tab === 'in' ? 'bg-success text-zinc-950' : 'text-slate-400'
            }`}
          >
            📥 Collections / Inflow
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'out'}
            onClick={() => setTab('out')}
            data-testid="tab-outflow"
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] ${
              tab === 'out' ? 'bg-amber-400 text-zinc-950' : 'text-slate-400'
            }`}
          >
            📤 Cash-Out / Outflow
          </button>
        </div>
      </div>

      {tab === 'in' ? (
        <div data-testid="inflow-panel">
          {/* Mobile cards */}
          <div className="sm:hidden">
            {inflow.length ? (
              <ClampedList label="Collections" testId="inflow-cards" className="divide-y divide-zinc-800">
                {inflow.map((row) => (
                  <div key={row.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-100">{row.memberName}</p>
                        <p className="mt-0.5 font-mono text-xs text-zinc-500">{row.memberCode}</p>
                      </div>
                      <p className="shrink-0 font-mono text-base font-bold tabular-nums text-success">
                        {formatMoney(row.amountMinor, row.currency)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {row.paidAt ? formatTimestampDate(row.paidAt, timeZone) : '—'}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-300">
                        {row.cashMinor > 0 && row.upiMinor > 0 ? 'Split' : row.method}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/payments/receipt/${row.id}`}
                      className="mt-2.5 flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/60 text-xs font-bold text-accent transition active:scale-[0.98]"
                    >
                      🧾 View Receipt
                    </Link>
                  </div>
                ))}
              </ClampedList>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">No collections yet.</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Member</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Mode</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Notes</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {inflow.slice(0, 5).map((row) => (
                  <tr key={row.id} className="transition hover:bg-zinc-800/30">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                      {row.paidAt ? formatTimestampDate(row.paidAt, timeZone) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/payments/receipt/${row.id}`} className="font-semibold text-white hover:text-accent">
                        {row.memberName}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{row.memberCode}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-300">
                        {row.cashMinor > 0 && row.upiMinor > 0 ? 'Split' : row.method}
                      </span>
                    </td>
                    <td className="max-w-64 truncate px-5 py-3 text-xs text-slate-500">
                      {row.notes ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-success">
                      {formatMoney(row.amountMinor, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inflow.length > 5 ? (
              <p className="border-t border-zinc-800 px-5 py-3 text-xs text-slate-500">
                Showing latest 5 of {inflow.length} collections
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div data-testid="outflow-panel">
          {/* Mobile cards */}
          <div className="sm:hidden">
            {outflow.length ? (
              <ClampedList label="Cash-Outs" testId="outflow-cards" className="divide-y divide-zinc-800">
                {outflow.map((row) => (
                  <div key={row.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                        {CATEGORY_LABEL[row.category] ?? row.category}
                      </span>
                      <p className="shrink-0 font-mono text-base font-bold tabular-nums text-danger">
                        − {formatMoney(row.amountMinor, currency)}
                      </p>
                    </div>
                    {row.note ? (
                      <p className="mt-2 text-xs text-slate-300">{row.note}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {formatTimestampDate(row.spentAt, timeZone)}, {timeOf(row.spentAt, timeZone)}
                      {' · '}
                      <span className="text-slate-400">{row.staffName}</span>
                    </p>
                  </div>
                ))}
              </ClampedList>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">No cash-out recorded.</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Note</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Staff Member</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {outflow.slice(0, 5).map((row) => (
                  <tr key={row.id} className="transition hover:bg-zinc-800/30">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                      {formatTimestampDate(row.spentAt, timeZone)}, {timeOf(row.spentAt, timeZone)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                        {CATEGORY_LABEL[row.category] ?? row.category}
                      </span>
                    </td>
                    <td className="max-w-72 truncate px-5 py-3 text-xs text-slate-400">
                      {row.note ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-300">{row.staffName}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-danger">
                      − {formatMoney(row.amountMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outflow.length > 5 ? (
              <p className="border-t border-zinc-800 px-5 py-3 text-xs text-slate-500">
                Showing latest 5 of {outflow.length} cash-outs
              </p>
            ) : null}
            {!outflow.length ? (
              <p className="p-8 text-center text-sm text-slate-500">No cash-out recorded.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
