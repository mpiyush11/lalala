'use client';

import { ChevronRight, MessageCircle, Plus, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useDebounced } from '@/lib/use-debounced';

export type PipelineLead = {
  createdAt: string;
  fullName: string;
  goal: string | null;
  id: string;
  interest: string | null;
  phoneNumber: string;
  source: string;
  status: string;
};

export type LeadStage = 'all' | 'follow_up' | 'trial' | 'hot' | 'lost';

const PILLS: Array<{ id: LeadStage; label: string }> = [
  { id: 'all', label: 'All Leads' },
  { id: 'follow_up', label: 'Follow-up Today' },
  { id: 'trial', label: 'On Trial' },
  { id: 'hot', label: 'Hot / Ready' },
  { id: 'lost', label: 'Lost / Cold' },
];

const TINT_BY_INDEX = [
  'bg-[#7C3AED]/20 text-white',
  'bg-[#7C3AED]/20 text-white',
  'bg-rose-500/20 text-rose-200',
  'bg-emerald-500/20 text-emerald-200',
  'bg-amber-500/20 text-amber-200',
];

const ACTION_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#141417] px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1A1A1E]';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

/** Whole days between a lead's creation and today. */
function ageInDays(createdAt: string, todayKey: string): number {
  return Math.max(0, Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(createdAt)) / 86_400_000));
}

/**
 * Leads pipeline table.
 *
 * SCROLL LOCK: the outer section is `flex-1 min-h-0 flex flex-col` and only the
 * table wrapper scrolls (`overflow-y-auto`), so the page itself never grows a
 * second scrollbar. The header row is sticky within that scroller, not the page.
 */
export function LeadsTable({ leads, timezone }: { leads: PipelineLead[]; timezone: string }) {
  const [term, setTerm] = useState('');
  const [stage, setStage] = useState<LeadStage>('all');
  const debouncedTerm = useDebounced(term, 150);

  const todayKey = useMemo(() => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', timeZone: timezone, year: 'numeric' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }, [timezone]);

  const open = useMemo(() => leads.filter((lead) => lead.status !== 'converted'), [leads]);

  const counts = useMemo(
    () => ({
      all: open.length,
      follow_up: open.filter((l) => l.status === 'new' || l.status === 'contacted').length,
      trial: open.filter((l) => l.status === 'trial_scheduled').length,
      hot: open.filter((l) => (l.status === 'new' || l.status === 'contacted') && (l.goal ?? l.interest) != null).length,
      lost: open.filter((l) => l.status === 'lost').length,
    }),
    [open],
  );

  const visible = useMemo(() => {
    const query = debouncedTerm.trim().toLocaleLowerCase();

    const byStage = open.filter((lead) => {
      if (stage === 'follow_up') return lead.status === 'new' || lead.status === 'contacted';
      if (stage === 'trial') return lead.status === 'trial_scheduled';
      if (stage === 'hot') return (lead.status === 'new' || lead.status === 'contacted') && (lead.goal ?? lead.interest) != null;
      if (stage === 'lost') return lead.status === 'lost';
      return true;
    });

    if (!query) return byStage;

    return byStage.filter((lead) =>
      `${lead.fullName} ${lead.phoneNumber} ${lead.source} ${lead.interest ?? ''} ${lead.goal ?? ''}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [debouncedTerm, open, stage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------- Action row: search + ONE action ---------- */}
      <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
        <div className="relative w-full min-w-0 lg:flex-1">
          <label htmlFor="leads-search" className="sr-only">
            Search leads by name, phone, or source
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <Search className="h-4 w-4" strokeWidth={2} />
          </span>
          <input
            id="leads-search"
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            autoComplete="off"
            placeholder="Lookup by Mobile + ID, Lead Name, or Source..."
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#141417] pl-10 pr-12 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                document.getElementById('leads-search')?.blur();
              }}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </div>

        <Link href="/dashboard/members/new" data-testid="new-lead-btn" className={ACTION_BASE}>
          <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          New Walk-in / Lead
        </Link>
      </div>

      {/* ---------- Stage pills ---------- */}
      <nav
        data-testid="lead-stage-pills"
        className="mt-3 flex flex-wrap items-center gap-2"
        aria-label="Lead stages"
      >
        {PILLS.map((pill) => {
          const isActive = stage === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStage(pill.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`rounded-xl px-4 py-1.5 text-xs transition ${
                isActive
                  ? 'border border-[#7C3AED]/30 bg-[#7C3AED]/15 text-white'
                  : 'border border-white/[0.08] bg-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {pill.label}
              {pill.id === 'all' ? ` (${counts.all})` : null}
              {pill.id === 'follow_up' ? ` (${counts.follow_up})` : null}
              {pill.id === 'trial' ? ` (${counts.trial})` : null}
              {pill.id === 'hot' ? ` (${counts.hot})` : null}
            </button>
          );
        })}
      </nav>

      {/* ---------- Scroll-locked table container ---------- */}
      <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#111113]">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-5 py-3 font-semibold">
                  Lead
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Source &amp; Interest
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Stage
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Next Follow-up
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.05]">
              {visible.map((lead, index) => {
                const age = ageInDays(lead.createdAt, todayKey);
                const isTrial = lead.status === 'trial_scheduled';
                const isLost = lead.status === 'lost';
                const isReady = (lead.status === 'new' || lead.status === 'contacted') && (lead.goal ?? lead.interest) != null;

                // No `follow_up_at` column exists — derived from lead age.
                let followUp = 'Due today';
                let followUpTone = 'text-amber-400';
                if (isTrial) {
                  followUp = age === 0 ? 'Trial on floor today' : `Trial booked ${age}d ago`;
                  followUpTone = age === 0 ? 'text-emerald-400' : 'text-zinc-400';
                } else if (isLost) {
                  followUp = 'Closed';
                  followUpTone = 'text-zinc-500';
                } else if (age > 0) {
                  followUp = `Overdue by ${age}d`;
                  followUpTone = 'text-rose-400';
                }

                return (
                  <tr key={lead.id} data-testid="lead-row" className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${TINT_BY_INDEX[index % TINT_BY_INDEX.length]}`}
                        >
                          {initials(lead.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{lead.fullName}</p>
                          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 tracking-normal">{lead.phoneNumber}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <p className="truncate text-xs text-zinc-300">{lead.interest ?? lead.goal ?? '—'}</p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500">{lead.source}</p>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="inline-block rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {isTrial ? 'On Trial' : lead.status === 'new' ? 'New Inquiry' : lead.status === 'lost' ? 'Lost' : 'Follow-up'}
                      </span>
                    </td>

                    <td className={`px-5 py-3.5 text-xs ${followUpTone}`}>{followUp}</td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/members/new?name=${encodeURIComponent(lead.fullName)}&phone=${encodeURIComponent(lead.phoneNumber)}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-transparent border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.04]">
                          <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                          Quick Chat
                        </Link>

                        {isReady ? (
                          <Link
                            href={`/dashboard/members/new?name=${encodeURIComponent(lead.fullName)}&phone=${encodeURIComponent(lead.phoneNumber)}`}
                            data-testid="lead-convert"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#6D28D9]">
                            Convert
                            <ChevronRight aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                          </Link>
                        ) : (
                          <Link
                            href={`/dashboard/members/new?name=${encodeURIComponent(lead.fullName)}&phone=${encodeURIComponent(lead.phoneNumber)}`}
                            data-testid="lead-advance"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.04]">
                            {isTrial ? 'Log Follow-up' : 'Book Trial'}
                            <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-white/[0.06] px-5 py-3 font-mono text-xs font-normal tabular-nums text-zinc-500 tracking-normal">
          Showing {visible.length} of {open.length} leads
        </p>
      </section>
    </div>
  );
}
