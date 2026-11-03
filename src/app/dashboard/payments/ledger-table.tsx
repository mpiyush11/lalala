'use client';

import { ChevronRight, IndianRupee, Search, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CashOutSheet } from '@/app/dashboard/cash-out-sheet';
import { formatMoney } from '@/lib/format/currency';
import { formatTimestampDate } from '@/lib/format/expiry';
import { useDebounced } from '@/lib/use-debounced';

import type { InflowRow, OutflowRow } from './payments-hub';

const CATEGORY_LABEL: Record<string, string> = {
  housekeeping: 'Housekeeping',
  other: 'Other',
  repairs: 'Repairs',
  staff_advance: 'Staff Advance',
  water_camper: 'Water Camper',
};

const ACTION_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-xs font-medium transition';

const MODE_TONE: Record<string, string> = {
  Cash: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  'Cash Out': 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  Split: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  Unpaid: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  UPI: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
};

const TINT_BY_INDEX = [
  'bg-[#7C3AED]/20 text-white',
  'bg-[#7C3AED]/20 text-white',
  'bg-emerald-500/20 text-emerald-200',
  'bg-rose-500/20 text-rose-200',
  'bg-amber-500/20 text-amber-200',
];

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

type Row = {
  actionHref: string;
  actionLabel: string;
  amountMinor: number;
  category: string;
  id: string;
  kind: 'in' | 'out';
  mode: string;
  subtitle: string;
  title: string;
};

/**
 * Ledger workspace: action row, KPI strip, filter pills and a scroll-locked table.
 *
 * SCROLL LOCK: only the table wrapper scrolls (`overflow-y-auto`). Every ancestor
 * is `min-h-0`, so the page can never grow a second scrollbar.
 */
export function LedgerTable({
  cashMinor,
  cashOutMinor,
  currency,
  inflow,
  openingMinor,
  outflow,
  staffId,
  tenantId,
  timezone,
}: {
  cashMinor: number;
  cashOutMinor: number;
  currency: string;
  inflow: InflowRow[];
  openingMinor: number;
  outflow: OutflowRow[];
  staffId: string;
  tenantId: string;
  timezone: string;
}) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState<'all' | 'cash' | 'upi' | 'expense' | 'dues'>('all');
  const debouncedTerm = useDebounced(term, 150);

  const rows = useMemo<Row[]>(() => {
    const paid = inflow.map((row) => ({
      actionHref: `/dashboard/payments/receipt/${row.id}`,
      actionLabel: 'Receipt',
      amountMinor: row.amountMinor,
      category: 'Membership Fee',
      id: row.id,
      kind: 'in' as const,
      mode: row.cashMinor > 0 && row.upiMinor > 0 ? 'Split' : row.method === 'cash' ? 'Cash' : 'UPI',
      subtitle: `TXN-${row.id.slice(0, 8).toUpperCase()} • ${
        row.paidAt ? `${formatTimestampDate(row.paidAt, timezone)}, ${timeOf(row.paidAt, timezone)}` : '—'
      }`,
      title: row.memberName,
    }));

    const spent = outflow.map((row) => ({
      actionHref: '/dashboard/payments?tab=outflow',
      actionLabel: 'Voucher',
      amountMinor: row.amountMinor,
      category: CATEGORY_LABEL[row.category] ?? row.category,
      id: row.id,
      kind: 'out' as const,
      mode: 'Cash Out',
      subtitle: `EXP-${row.id.slice(0, 8).toUpperCase()} • ${formatTimestampDate(row.spentAt, timezone)}, ${timeOf(row.spentAt, timezone)} • ${row.staffName}`,
      title: row.note ?? CATEGORY_LABEL[row.category] ?? 'Expense',
    }));

    return [...paid, ...spent];
  }, [inflow, outflow, timezone]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      cash: rows.filter((r) => r.mode === 'Cash').length,
      expense: rows.filter((r) => r.kind === 'out').length,
      upi: rows.filter((r) => r.mode === 'UPI').length,
      dues: 0,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const query = debouncedTerm.trim().toLocaleLowerCase();

    const filtered = rows.filter((row) => {
      if (active === 'cash') return row.mode === 'Cash';
      if (active === 'upi') return row.mode === 'UPI';
      if (active === 'expense') return row.kind === 'out';
      if (active === 'dues') return false;
      return true;
    });

    if (!query) return filtered;
    return filtered.filter((row) =>
      `${row.title} ${row.category} ${row.mode} ${row.subtitle}`.toLocaleLowerCase().includes(query),
    );
  }, [active, debouncedTerm, rows]);

  const upiMinor = inflow.reduce((sum, row) => sum + row.upiMinor, 0);
  const upiCount = inflow.filter((row) => row.upiMinor > 0).length;

  const PILLS: Array<{ id: 'all' | 'cash' | 'upi' | 'expense' | 'dues'; label: string }> = [
    { id: 'all', label: `All Entries (${counts.all})` },
    { id: 'cash', label: 'Cash Only' },
    { id: 'upi', label: 'UPI / Digital' },
    { id: 'expense', label: 'Expenses (Outflow)' },
    { id: 'dues', label: `Pending Dues (${counts.dues})` },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------- Action row: search + TWO actions ---------- */}
      <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
        <div className="relative w-full min-w-0 lg:flex-1">
          <label htmlFor="ledger-search" className="sr-only">
            Search ledger by name, receipt, or category
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <Search className="h-4 w-4" strokeWidth={2} />
          </span>
          <input
            id="ledger-search"
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            autoComplete="off"
            placeholder="Lookup by Receipt ID, Member, or Category..."
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#141417] pl-10 pr-12 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                document.getElementById('ledger-search')?.blur();
              }}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </div>

        <Link
          href="/dashboard/payments/collect"
          data-testid="collect-fee-btn"
          className={`${ACTION_BASE} bg-[#7C3AED] text-white hover:bg-[#6D28D9]`}
        >
          <IndianRupee aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          Collect Fee
        </Link>

        <CashOutSheet staffId={staffId} tenantId={tenantId} />
      </div>

      {/* ---------- 3-KPI strip ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 font-mono tabular-nums sm:grid-cols-3 tracking-normal">
        <article className="rounded-2xl border border-white/[0.08] bg-[#111113] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
            Physical cash in drawer
          </p>
          <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-white">
            {formatMoney(cashMinor - cashOutMinor, currency)}
          </p>
          <p className="mt-2 truncate text-xs text-zinc-400">
            Opening {formatMoney(openingMinor, currency)} + {formatMoney(cashMinor, currency)} In -{' '}
            {formatMoney(cashOutMinor, currency)} Exp
          </p>
        </article>

        <article className="rounded-2xl border border-white/[0.08] bg-[#111113] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
            UPI / Digital collected
          </p>
          <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-emerald-400">
            {formatMoney(upiMinor, currency)}
          </p>
          <p className="mt-2 truncate text-xs text-zinc-400">{upiCount} transactions verified today</p>
        </article>

        <article className="rounded-2xl border border-white/[0.08] bg-[#111113] p-4">
          {/* "Petty" is on BANNED_WORDS, so the label is the neutral, accurate
              wording. The figure stays rose with an explicit minus sign. */}
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
            Cash expenses (outflow)
          </p>
          <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-rose-400">
            −{formatMoney(cashOutMinor, currency)}
          </p>
          <p className="mt-2 truncate text-xs text-zinc-400">{outflow.length} cash expenses recorded</p>
        </article>
      </div>

      {/* ---------- Filter pills ---------- */}
      <nav
        data-testid="ledger-filter-pills"
        className="mt-3 flex flex-wrap items-center gap-2"
        aria-label="Ledger filters"
      >
        {PILLS.map((pill) => {
          const isActive = active === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActive(pill.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`rounded-xl px-4 py-1.5 text-xs transition ${
                isActive
                  ? 'border border-[#7C3AED]/30 bg-[#7C3AED]/15 text-white'
                  : 'border border-white/[0.08] bg-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </nav>

      {/* ---------- Scroll-locked table ---------- */}
      <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#111113]">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-5 py-3 font-semibold">
                  Particulars
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Mode
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.05]">
              {visible.map((row, index) => {
                const isOut = row.kind === 'out';
                const tone = isOut ? 'text-rose-400' : 'text-emerald-400';
                const sign = isOut ? '−' : '+';
                const modeTone = MODE_TONE[row.mode] ?? 'border-white/[0.08] text-zinc-300';

                return (
                  <tr key={row.id} data-testid="ledger-row" className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${TINT_BY_INDEX[index % TINT_BY_INDEX.length]}`}
                        >
                          {initials(row.title)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{row.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{row.subtitle}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-zinc-300">{row.category}</td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium ${modeTone}`}
                      >
                        {row.mode}
                      </span>
                    </td>

                    <td className={`px-5 py-3.5 text-right font-mono text-sm font-medium tabular-nums lining-nums ${tone}`}>
                      {sign}
                      {formatMoney(row.amountMinor, currency)}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end">
                        <Link
                          href={row.actionHref}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.04]"
                        >
                          {row.actionLabel}
                          <ChevronRight aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-white/[0.06] px-5 py-3 font-mono text-xs font-normal tabular-nums text-zinc-500 tracking-normal">
          Showing {visible.length} of {rows.length} entries
        </p>
      </section>
    </div>
  );
}
