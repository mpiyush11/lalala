'use client';

import Link from 'next/link';
import { useState } from 'react';

export type PulseDue = {
  amountMinor: number;
  id: string;
  name: string;
  planLabel: string;
};

export type PulseCollection = {
  amountMinor: number;
  memberId: string;
  memberName: string;
  paymentId: string;
  time: string;
};

type Tab = 'dues' | 'collections';

const ROW = 'flex min-h-[46px] items-center gap-2.5 px-3 py-2';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`)
    .toUpperCase();
}

function money(minor: number): string {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Math.round(minor / 100));
}

/**
 * Today's Desk Pulse.
 *
 * Sits directly under the POS actions and answers the two questions a
 * receptionist gets asked at the counter: who owes money, and what came in
 * today. Deliberately NOT cards — three single-line rows at ~46px, so the
 * widget costs about the same height as one card and never pushes the actions
 * off the fold.
 *
 * Everything is a link, so nothing here needs client-side routing: the member
 * row opens that member's ledger drawer, [Collect] pre-fills the collection
 * form, [Receipt] opens the verified receipt.
 */
export function DeskPulse({
  collections,
  dues,
  duesTotalCount,
}: {
  collections: PulseCollection[];
  dues: PulseDue[];
  duesTotalCount: number;
}) {
  const [tab, setTab] = useState<Tab>('dues');
  const rows = (tab === 'dues' ? dues : collections).slice(0, 3);

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'dues', label: 'Dues & Expiring', count: duesTotalCount },
    { id: 'collections', label: "Today's Collections", count: collections.length },
  ];

  return (
    <section
      aria-labelledby="desk-pulse-heading"
      className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-surface"
    >
      <h2 id="desk-pulse-heading" className="sr-only">
        Today&apos;s desk pulse
      </h2>

      {/* Segmented control. Counts are the reason this is two tabs and not a
          stacked list: the number tells you whether to open it at all. */}
      <div
        role="tablist"
        aria-label="Desk pulse"
        data-testid="desk-pulse-tabs"
        className="flex gap-1 border-b border-border/60 p-1.5"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            data-testid={`desk-pulse-tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
              tab === item.id
                ? 'bg-surface-elevated text-white'
                : 'text-slate-400 hover:bg-surface-elevated/50 hover:text-slate-200'
            }`}
          >
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-[10px] text-slate-500">{item.count}</span>
          </button>
        ))}
      </div>

      {rows.length ? (
        <ul data-testid="desk-pulse-list" className="divide-y divide-border/50">
          {rows.map((row) =>
            tab === 'dues' ? (
              <DueRow key={(row as PulseDue).id} due={row as PulseDue} />
            ) : (
              <CollectionRow key={(row as PulseCollection).paymentId} entry={row as PulseCollection} />
            ),
          )}
        </ul>
      ) : (
        <p data-testid="desk-pulse-empty" className={`${ROW} text-xs text-slate-500`}>
          {tab === 'dues' ? 'Nothing outstanding. Everyone has paid.' : 'No collections recorded yet today.'}
        </p>
      )}

      <div className="border-t border-border/60 px-3 py-2.5">
        <Link
          href={tab === 'dues' ? '/dashboard/members?filter=dues' : '/dashboard/payments'}
          data-testid="desk-pulse-view-all"
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:gap-2"
        >
          {tab === 'dues'
            ? `View all dues (${duesTotalCount}) →`
            : 'View full ledger →'}
        </Link>
      </div>
    </section>
  );
}

function DueRow({ due }: { due: PulseDue }) {
  return (
    <li data-testid="pulse-due-row" className={ROW}>
      <Link
        href={`/dashboard/members?member=${due.id}`}
        data-testid="pulse-due-member"
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-danger/25 bg-danger/10 text-[10px] font-bold text-danger"
        >
          {initials(due.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-200">{due.name}</span>
          <span className="block truncate text-[10px] text-slate-500">{due.planLabel}</span>
        </span>
      </Link>

      <span className="shrink-0 text-xs font-bold tabular-nums text-white">
        {money(due.amountMinor)}
      </span>

      <Link
        href={`/dashboard/payments/collect?memberId=${due.id}`}
        data-testid="pulse-collect"
        className="shrink-0 rounded-full border border-success/40 bg-success/15 px-2.5 py-1 text-[10px] font-bold text-success transition hover:bg-success/25"
      >
        Collect
      </Link>
    </li>
  );
}

function CollectionRow({ entry }: { entry: PulseCollection }) {
  return (
    <li data-testid="pulse-collection-row" className={ROW}>
      <Link
        href={`/dashboard/members?member=${entry.memberId}`}
        data-testid="pulse-collection-member"
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-[10px] font-bold text-accent"
        >
          {initials(entry.memberName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-200">
            {entry.memberName}
          </span>
          <span className="block truncate font-mono text-[10px] text-slate-500">{entry.time}</span>
        </span>
      </Link>

      <span className="shrink-0 text-xs font-bold tabular-nums text-success">
        +{money(entry.amountMinor)}
      </span>

      <Link
        href={`/dashboard/payments/receipt/${entry.paymentId}`}
        data-testid="pulse-receipt"
        className="shrink-0 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-bold text-accent transition hover:bg-accent/25"
      >
        Receipt
      </Link>
    </li>
  );
}
