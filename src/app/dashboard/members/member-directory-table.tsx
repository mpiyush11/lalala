'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { daysUntil, describeExpiry, formatDateKey } from '@/lib/format/expiry';
import { buildRenewalWhatsAppUrl } from '@/lib/notifications/whatsapp';
import { useDebounced } from '@/lib/use-debounced';

export type DirectoryFilter = 'all' | 'active' | 'expiring' | 'expired';

export type DirectoryMember = {
  expiresOn: string;
  fullName: string;
  id: string;
  memberCode: string;
  phoneNumber: string;
  status: string;
};

const TABS: Array<{ id: DirectoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring Soon' },
  { id: 'expired', label: 'Expired' },
];

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

/**
 * Member directory with real-time client-side filtering.
 *
 * The full tenant-scoped list is delivered once by the server component, so
 * every keystroke filters in memory with no network round trip and no tenant
 * boundary risk. Filter tabs stay in the URL so a ledger deep-link is shareable.
 */
export function MemberDirectoryTable({
  filter,
  gymName,
  members,
  todayKey,
}: {
  filter: DirectoryFilter;
  gymName: string;
  members: DirectoryMember[];
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

      if (filter === 'active') return member.status === 'active';
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

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        {/* Row 1 — search + primary action, isolated from the pill slider. */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="directory-search" className="sr-only">
              Search members by name, phone, or member code
            </label>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
            <input
              id="directory-search"
              type="text"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              autoComplete="off"
              placeholder="Search name, phone, or code"
              className="h-12 w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 pl-10 pr-12 text-base text-white outline-none focus:border-accent sm:h-10 sm:text-sm"
            />
            {term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  // Dismiss the on-screen keyboard immediately on mobile.
                  document.getElementById('directory-search')?.blur();
                }}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:h-8 sm:w-8"
              >
                ✕
              </button>
            ) : null}
          </div>

          <Link
            href="/dashboard/members/new"
            data-testid="add-member-btn"
            className="inline-flex h-12 min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-accent/40 bg-accent/15 px-3 text-sm font-bold text-accent transition hover:bg-accent/25 active:scale-[0.98] sm:h-10 sm:min-h-0 sm:px-4"
          >
            + Add
            <span className="hidden sm:ml-1 sm:inline">Member</span>
          </Link>
        </div>

        {/* Row 2 — filter pills own the full width and scroll freely. */}
        <nav
          data-testid="filter-pills"
          className="scrollbar-hide -mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
          aria-label="Member filters"
        >
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === 'all' ? '/dashboard/members' : `/dashboard/members?filter=${tab.id}`}
              scroll={false}
              className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg border px-4 text-xs font-semibold transition sm:min-h-0 sm:py-2 ${
                filter === tab.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-zinc-800 bg-zinc-950/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Mobile: vertical touch card feed. */}
      <ul className="mt-4 space-y-2.5 sm:hidden" data-testid="mobile-card-feed">
        {visible.map((member) => {
          const expiry = describeExpiry(todayKey, member.expiresOn);
          const waUrl = buildRenewalWhatsAppUrl({
            expiredOn: formatDateKey(member.expiresOn),
            gymName,
            memberName: member.fullName,
            phoneNumber: member.phoneNumber,
          });
          const ledgerParams = new URLSearchParams({ member: member.id });
          if (filter !== 'all') ledgerParams.set('filter', filter);
          const remaining = daysUntil(todayKey, member.expiresOn);
          const isExpired = remaining < 0;
          // High-contrast badge only for genuine risk (<=7 days or lapsed).
          const isUrgent = remaining <= 7;

          return (
            <li
              key={member.id}
              className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-3.5"
            >
              {/* Tier 1 — identity + status dot */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-100">{member.fullName}</p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">{member.memberCode}</p>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap text-xs font-semibold ${
                    isExpired ? 'text-danger' : 'text-success'
                  }`}
                >
                  ● {isExpired ? 'Expired' : 'Active'}
                </span>
              </div>

              {/* Tier 2 — reachability + risk */}
              <div className="mt-2.5 flex items-center gap-2">
                <a
                  href={`tel:${member.phoneNumber}`}
                  className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-300 active:text-accent"
                >
                  {member.phoneNumber}
                </a>
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${member.fullName}`}
                    className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg border border-success/30 bg-success/10 text-success transition active:scale-[0.98]"
                  >
                    <WhatsAppGlyph />
                  </a>
                ) : null}
              </div>

              <p className="mt-2">
                {isUrgent ? (
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${expiry.className}`}>
                    {expiry.label}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">
                    Exp: {formatDateKey(member.expiresOn)} ({remaining}d left)
                  </span>
                )}
              </p>

              {/* Tier 3 — 50/50 action footer */}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-2">
                <Link
                  href={`/dashboard/payments/collect?memberId=${member.id}`}
                  className="flex min-h-[44px] items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-xs font-bold text-accent transition active:scale-[0.98]"
                >
                  ⚡ Quick Renew
                </Link>
                <Link
                  href={`/dashboard/members?${ledgerParams}`}
                  scroll={false}
                  className="flex min-h-[44px] items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 transition active:scale-[0.98]"
                >
                  👤 Ledger
                </Link>
              </div>
            </li>
          );
        })}
        {!visible.length ? (
          <li className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-8 text-center text-sm text-slate-500">
            {debouncedTerm.trim() ? `No members match “${debouncedTerm.trim()}”.` : 'No members match this view.'}
          </li>
        ) : null}
        <li className="px-1 pt-1 text-center text-xs text-slate-500">
          Showing {visible.length} of {members.length} members
        </li>
      </ul>

      {/* Desktop: table unchanged. */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Member</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Phone</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Expiry</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {visible.map((member) => {
                const expiry = describeExpiry(todayKey, member.expiresOn);
                const waUrl = buildRenewalWhatsAppUrl({
                  expiredOn: formatDateKey(member.expiresOn),
                  gymName,
                  memberName: member.fullName,
                  phoneNumber: member.phoneNumber,
                });
                const ledgerParams = new URLSearchParams({ member: member.id });
                if (filter !== 'all') ledgerParams.set('filter', filter);

                return (
                  <tr key={member.id} className="transition hover:bg-zinc-800/30">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-white">{member.fullName}</p>
                      <p className="mt-0.5 font-mono text-xs text-accent">{member.memberCode}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-300">{member.phoneNumber}</span>
                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`WhatsApp ${member.fullName}`}
                            aria-label={`WhatsApp ${member.fullName}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-success/30 bg-success/10 text-success transition hover:bg-success/20"
                          >
                            <WhatsAppGlyph />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${expiry.className}`}>
                        {expiry.label}
                      </span>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        {formatDateKey(member.expiresOn)}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                          member.status === 'active'
                            ? 'bg-success/10 text-success'
                            : member.status === 'expired'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-zinc-800 text-slate-300'
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/payments/collect?memberId=${member.id}`}
                          className="inline-flex h-8 items-center rounded-full border border-accent/40 bg-accent/15 px-3 text-xs font-bold text-accent transition hover:bg-accent/25"
                        >
                          ⚡ Renew
                        </Link>
                        <Link
                          href={`/dashboard/members?${ledgerParams}`}
                          scroll={false}
                          className="inline-flex h-8 items-center rounded-full border border-zinc-700 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                        >
                          👤 Ledger
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {debouncedTerm.trim()
              ? `No members match “${debouncedTerm.trim()}”.`
              : 'No members match this view.'}
          </p>
        ) : null}
        <p className="border-t border-zinc-800 px-5 py-3 text-xs text-slate-500">
          Showing {visible.length} of {members.length} members
        </p>
      </div>
    </>
  );
}
