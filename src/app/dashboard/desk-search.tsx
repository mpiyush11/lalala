'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { playAlertBeep } from '@/lib/notifications/sound';
import {
  buildDueReminderWhatsAppUrl,
  buildRenewalWhatsAppUrl,
} from '@/lib/notifications/whatsapp';
import { createClient } from '@/lib/supabase/client';

import { QuickRenewModal, type QuickRenewTarget } from './quick-renew-modal';
import { formatMoney as formatCurrency } from '@/lib/format/currency';

export type SearchableMember = {
  checkedInToday: boolean;
  duesMinor: number;
  expiresOn: string;
  fullName: string;
  id: string;
  lastAmountMinor: number | null;
  memberCode: string;
  phoneNumber: string;
  status: 'active' | 'expiring' | 'expired';
};

const STATUS_BADGE: Record<SearchableMember['status'], { className: string; label: string }> = {
  active: { className: 'bg-success/10 text-success', label: 'Active' },
  expired: { className: 'bg-danger/10 text-danger', label: 'Expired' },
  expiring: { className: 'bg-amber-400/10 text-amber-300', label: 'Expiring Soon' },
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

/**
 * Front-desk global member lookup with inline workflows.
 *
 * Filters an already tenant-scoped list supplied by the server component, so no
 * client-side query can widen the tenant boundary. Every write goes through an
 * RPC that re-verifies tenant and role from the JWT.
 */
export function DeskSearch({
  attendanceEnabled,
  currency,
  gymName,
  members,
  tenantId,
}: {
  attendanceEnabled: boolean;
  currency: string;
  gymName: string;
  members: SearchableMember[];
  tenantId: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [renewTarget, setRenewTarget] = useState<QuickRenewTarget | null>(null);
  const [pendingCheckIn, setPendingCheckIn] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const alertedRef = useRef<Set<string>>(new Set());

  const query = term.trim().toLocaleLowerCase();

  const results = useMemo(() => {
    if (!query) return [];

    return members
      .filter((member) =>
        `${member.fullName} ${member.memberCode} ${member.phoneNumber}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  }, [members, query]);

  // Sound a soft alert the first time a given problem member surfaces, so the
  // receptionist notices dues/expiry without reading every row.
  useEffect(() => {
    const flagged = results.find(
      (member) => member.status === 'expired' || member.duesMinor > 0,
    );

    if (!flagged) return;
    if (alertedRef.current.has(flagged.id)) return;

    alertedRef.current.add(flagged.id);
    playAlertBeep();
  }, [results]);

  async function punchIn(member: SearchableMember) {
    setPendingCheckIn(member.id);
    setFeedback(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('check_in_member', {
        p_member_id: member.id,
        p_prevent_duplicate_same_day: true,
        p_tenant_id: tenantId,
      });

      if (error) {
        setFeedback({
          kind: 'error',
          text:
            error.code === '23505'
              ? `${member.fullName} is already checked in today.`
              : error.message,
        });
        return;
      }

      setFeedback({ kind: 'success', text: `${member.fullName} checked in.` });
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setPendingCheckIn(null);
    }
  }

  return (
    <div className="relative">
      <label htmlFor="desk-search" className="sr-only">
        Search members by name, phone, or member code
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          id="desk-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          autoComplete="off"
          placeholder="Search member by name, phone, or code…"
          className="h-12 w-full rounded-xl border border-border/70 bg-surface pl-12 pr-4 text-base text-white placeholder:text-slate-500 focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10"
        />
        {term ? (
          <button
            type="button"
            onClick={() => setTerm('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {feedback ? (
        <p
          role="status"
          className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${
            feedback.kind === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-red-200'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      {query ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated shadow-2xl shadow-black/40">
          {results.length ? (
            <ul className="max-h-[26rem] divide-y divide-border/50 overflow-y-auto">
              {results.map((member) => {
                const badge = STATUS_BADGE[member.status];
                const whatsAppUrl =
                  member.duesMinor > 0
                    ? buildDueReminderWhatsAppUrl({
                        amountMinor: member.duesMinor,
                        currency,
                        gymName,
                        memberName: member.fullName,
                        phoneNumber: member.phoneNumber,
                      })
                    : buildRenewalWhatsAppUrl({
                        expiredOn: member.expiresOn,
                        gymName,
                        memberName: member.fullName,
                        phoneNumber: member.phoneNumber,
                      });

                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                      {member.fullName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{member.fullName}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {member.memberCode} · {member.phoneNumber}
                        {member.duesMinor > 0
                          ? ` · Due ${formatCurrency(member.duesMinor, currency)}`
                          : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Active member -> attendance punch-in */}
                      {attendanceEnabled && member.status !== 'expired' ? (
                        member.checkedInToday ? (
                          <span className="inline-flex h-9 items-center rounded-lg bg-success/10 px-3 text-xs font-semibold text-success">
                            ✓ Checked In
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pendingCheckIn === member.id}
                            onClick={() => punchIn(member)}
                            className="inline-flex h-9 items-center rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-50"
                          >
                            {pendingCheckIn === member.id ? 'Punching…' : 'Punch In'}
                          </button>
                        )
                      ) : null}

                      {/* Expired member -> 1-click renewal */}
                      {member.status === 'expired' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRenewTarget({
                              fullName: member.fullName,
                              id: member.id,
                              lastAmountMinor: member.lastAmountMinor,
                              memberCode: member.memberCode,
                            })
                          }
                          className="inline-flex h-9 items-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-400/20"
                        >
                          ⚡ Quick Renew
                        </button>
                      ) : null}

                      {/* Outstanding balance -> settle */}
                      {member.duesMinor > 0 ? (
                        <Link
                          href={`/dashboard/payments/collect?memberId=${member.id}`}
                          className="inline-flex h-9 items-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-semibold text-red-200 transition hover:bg-danger/20"
                        >
                          Settle Due
                        </Link>
                      ) : null}

                      {whatsAppUrl ? (
                        <a
                          href={whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`WhatsApp ${member.fullName}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-semibold text-success transition hover:bg-success/20"
                        >
                          <WhatsAppIcon />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No member matches “{term.trim()}”.
            </p>
          )}
        </div>
      ) : null}

      {renewTarget ? (
        <QuickRenewModal
          currency={currency}
          onClose={() => setRenewTarget(null)}
          target={renewTarget}
          tenantId={tenantId}
        />
      ) : null}
    </div>
  );
}
