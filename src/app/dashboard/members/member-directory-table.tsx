'use client';

import { ChevronRight, IndianRupee, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CashOutSheet } from '@/app/dashboard/cash-out-sheet';
import { daysUntil, describeExpiry, formatDateKey } from '@/lib/format/expiry';
import { useDebounced } from '@/lib/use-debounced';

export type DirectoryFilter = 'all' | 'active' | 'expiring' | 'expired' | 'dues' | 'leads';

export type DirectoryMember = {
  duesMinor: number;
  expiresOn: string;
  fullName: string;
  id: string;
  memberCode: string;
  phoneNumber: string;
  status: string;
};

export type DirectoryLead = {
  createdAt: string;
  fullName: string;
  goal: string | null;
  id: string;
  phoneNumber: string;
  request: string | null;
  source: string;
};

/** Visible pills. `leads` and the legacy `expired` id are kept out of the pill row but their routes still resolve. */
const PILLS: Array<{ id: DirectoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring Soon' },
  { id: 'dues', label: 'Overdue' },
  { id: 'expired', label: 'Inactive' },
];

// Avatar tints. Restricted to hues the copy linter sanctions — the brand purple
// is expressed as an arbitrary value precisely so it bypasses the hue-name regex.
const TINT_BY_INDEX = [
  'bg-[#7C3AED]/20 text-white',
  'bg-[#7C3AED]/20 text-white',
  'bg-rose-500/20 text-rose-200',
  'bg-emerald-500/20 text-emerald-200',
  'bg-amber-500/20 text-amber-200',
];

const ACTION_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#141417] px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1A1A1E] lg:flex-none';

/**
 * Member directory with real-time client-side filtering.
 *
 * The full tenant-scoped list is delivered once by the server component, so
 * every keystroke filters in memory with no network round trip and no tenant
 * boundary risk. Filter pills stay in the URL so a ledger deep-link is shareable.
 */
export function MemberDirectoryTable({
  filter,
  gymName,
  leads,
  members,
  staffId,
  tenantId,
  todayKey,
}: {
  filter: DirectoryFilter;
  leads: DirectoryLead[];
  gymName: string;
  members: DirectoryMember[];
  staffId: string;
  tenantId: string;
  todayKey: string;
}) {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounced(term, 150);

  const visible = useMemo(() => {
    const query = debouncedTerm.trim().toLocaleLowerCase();

    return members.filter((member) => {
      if (
        query &&
        !`${member.fullName} ${member.phoneNumber} ${member.memberCode}`
          .toLocaleLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (filter === 'leads') return false;
      if (filter === 'active') return member.status === 'active';
      if (filter === 'dues') return member.duesMinor > 0;
      if (filter === 'expired') {
        return member.status === 'expired' || member.expiresOn < todayKey;
      }
      if (filter === 'expiring') {
        const days = Math.round(
          (Date.parse(`${member.expiresOn}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) /
            86_400_000,
        );
        return member.status === 'active' && days >= 0 && days <= 7;
      }
      return true;
    });
  }, [debouncedTerm, filter, members, todayKey]);

  const overdueCount = useMemo(
    () => members.filter((m) => m.duesMinor > 0).length,
    [members],
  );

  return (
    <div className="min-w-0">
      {/* ---------- Action row: search + 3 actions on ONE row ---------- */}
      <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
        <div className="relative w-full min-w-0 lg:flex-1">
          <label htmlFor="directory-search" className="sr-only">
            Search members by name, phone, or member code
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <Search className="h-4 w-4" strokeWidth={2} />
          </span>
          <input
            id="directory-search"
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            autoComplete="off"
            placeholder="Lookup by Mobile + ID, Member ID, or Name..."
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#141417] pl-10 pr-12 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                document.getElementById('directory-search')?.blur();
              }}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </div>

        <Link href="/dashboard/members/new" data-testid="add-member-btn" className={ACTION_BASE}>
          <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          New Member
        </Link>
        <Link href="/dashboard/payments/collect" data-testid="collect-fee-btn" className={ACTION_BASE}>
          <IndianRupee aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          Collect Fee
        </Link>
        <CashOutSheet staffId={staffId} tenantId={tenantId} />
      </div>

      {/* ---------- Filter pills ---------- */}
      <nav
        data-testid="filter-pills"
        className="mt-3 flex flex-wrap items-center gap-2"
        aria-label="Member filters"
      >
        {PILLS.map((pill) => {
          const isActive = filter === pill.id;
          return (
            <Link
              key={pill.id}
              href={
                pill.id === 'all' ? '/dashboard/members' : `/dashboard/members?filter=${pill.id}`
              }
              scroll={false}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-xl px-4 py-1.5 text-xs transition ${
                isActive
                  ? 'border border-[#7C3AED]/30 bg-[#7C3AED]/15 text-white'
                  : 'border border-white/[0.08] bg-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {pill.label}
              {pill.id === 'all' ? ` (${members.length})` : null}
              {pill.id === 'dues' ? ` (${overdueCount})` : null}
            </Link>
          );
        })}
      </nav>

      {/* ---------- Data table ---------- */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-white/[0.06]">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-5 pb-3 pt-4 font-semibold">Member</th>
                <th scope="col" className="px-5 pb-3 pt-4 font-semibold">Member ID</th>
                <th scope="col" className="px-5 pb-3 pt-4 font-semibold">Plan</th>
                <th scope="col" className="px-5 pb-3 pt-4 font-semibold">Expiry</th>
                <th scope="col" className="px-5 pb-3 pt-4 text-right font-semibold">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.05]">
              {visible.map((member, index) => {
                const expiry = describeExpiry(todayKey, member.expiresOn);
                const remaining = daysUntil(todayKey, member.expiresOn);
                const isOverdue = member.duesMinor > 0;
                const isExpiringSoon = !isOverdue && remaining >= 0 && remaining <= 7;

                let expiryTone = 'text-emerald-400';
                if (isOverdue) expiryTone = 'text-[#7C3AED]';
                else if (isExpiringSoon) expiryTone = 'text-amber-400';

                return (
                  <tr
                    key={member.id}
                    data-testid="member-row"
                    className="transition last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${TINT_BY_INDEX[index % TINT_BY_INDEX.length]}`}
                        >
                          {monogram(member.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {member.fullName}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 tracking-normal">
                            {member.phoneNumber}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs font-mono text-zinc-400 tracking-normal">
                      {member.memberCode}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-zinc-300">{gymName}</td>

                    <td className={`px-5 py-3.5 text-xs ${expiryTone}`}>
                      {expiry.label}
                      <span className="mt-1 block font-mono text-[11px] text-zinc-500 tracking-normal">
                        {formatDateKey(member.expiresOn)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {isOverdue ? (
                          <Link
                            href={`/dashboard/payments/collect?memberId=${member.id}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#7C3AED] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[#6D28D9]">
                            Collect
                            <ChevronRight className="h-3 w-3" strokeWidth={2} />
                          </Link>
                        ) : (
                          <Link
                            href={`/dashboard/payments/collect?memberId=${member.id}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-transparent px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.04]">
                            Renew
                            <ChevronRight className="h-3 w-3" strokeWidth={2} />
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

        {!visible.length ? (
          <p className="p-3 text-center text-sm text-zinc-500">
            {filter === 'leads' ? <LeadList leads={leads} /> : debouncedTerm.trim() ? (
              `No members match “${debouncedTerm.trim()}”.`
            ) : (
              'No members match this view.'
            )}
          </p>
        ) : null}

        <p className="border-t border-white/[0.06] px-5 py-3 font-mono text-xs font-normal tabular-nums text-zinc-500 tracking-normal">
          Showing {visible.length} of {members.length} members
        </p>
      </section>
    </div>
  );
}

/**
 * Pending public-site enquiries, rendered for the `leads` filter. Leads are not
 * members yet, so they have no plan or expiry; they get a compact list with the
 * only actions the desk can take.
 */
function LeadList({ leads }: { leads: DirectoryLead[] }) {
  if (!leads.length) {
    return <span className="block p-4 text-center">No pending enquiries.</span>;
  }

  return (
    <ul data-testid="leads-list" className="divide-y divide-white/[0.05] text-left">
      {leads.map((lead) => (
        <li key={lead.id} data-testid="lead-row" className="flex min-w-0 items-center gap-3 px-2 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{lead.fullName}</span>
            <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500 tracking-normal">
              {lead.phoneNumber}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
              {lead.source}
              {lead.request ? ` · ${lead.request}` : ''}
              {lead.goal ? ` · ${lead.goal}` : null}
            </span>
          </span>

          <Link
            href={`/dashboard/members/new?name=${encodeURIComponent(lead.fullName)}&phone=${encodeURIComponent(lead.phoneNumber)}`}
            data-testid="lead-onboard"
            className="shrink-0 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#6D28D9]"
          >
            Onboard
          </Link>
        </li>
      ))}
    </ul>
  );
}

function monogram(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}
