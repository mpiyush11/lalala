'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { formatDateKey } from '@/lib/format/expiry';
import { playAlertBeep } from '@/lib/notifications/sound';
import {
  buildDueReminderWhatsAppUrl,
  buildRenewalWhatsAppUrl,
} from '@/lib/notifications/whatsapp';

import { QuickRenewModal, type QuickRenewTarget } from './quick-renew-modal';
import { formatMoney as formatCurrency } from '@/lib/format/currency';

export type DefaulterAlert = {
  duesMinor: number;
  fullName: string;
  id: string;
  memberCode: string;
  phoneNumber: string;
};

export type ExpiredAlert = {
  expiresOn: string;
  fullName: string;
  id: string;
  lastAmountMinor: number | null;
  memberCode: string;
  phoneNumber: string;
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

/**
 * Front-desk alert centre.
 *
 * Alert rows are supplied by the server component and are therefore already
 * constrained by RLS to the signed-in tenant. This component performs no
 * queries of its own.
 */
export function NotificationBell({
  currency,
  defaulters,
  expired,
  gymName,
  tenantId,
}: {
  currency: string;
  defaulters: DefaulterAlert[];
  expired: ExpiredAlert[];
  gymName: string;
  tenantId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<QuickRenewTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasChimedRef = useRef(false);

  const total = defaulters.length + expired.length;

  // Chime once per mount when actionable alerts exist.
  useEffect(() => {
    if (total > 0 && !hasChimedRef.current) {
      hasChimedRef.current = true;
      playAlertBeep();
    }
  }, [total]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Notifications: ${total} actionable item${total === 1 ? '' : 's'}`}
        className="relative grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-zinc-700 bg-zinc-900 text-slate-200 transition hover:border-accent/40 hover:text-accent active:scale-[0.98] sm:h-10 sm:w-10 sm:min-h-0 sm:min-w-0"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-lg">
            {total > 99 ? '99+' : total}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated shadow-2xl shadow-black/50 sm:w-96">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-bold text-white">Action Center</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {total} item{total === 1 ? '' : 's'} need attention
            </p>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {total === 0 ? (
              /* No oversized empty card: a single inline micro-pill. */
              <p className="px-4 py-5 text-center">
                <span className="inline-flex items-center rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  ✓ 0 pending alerts
                </span>
              </p>
            ) : null}

            {defaulters.length ? (
              <section>
                <h3 className="bg-surface/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-danger">
                  Unpaid dues ({defaulters.length})
                </h3>
                <ul className="divide-y divide-border/50">
                  {defaulters.map((member) => {
                    const waUrl = buildDueReminderWhatsAppUrl({
                      amountMinor: member.duesMinor,
                      currency,
                      gymName,
                      memberName: member.fullName,
                      phoneNumber: member.phoneNumber,
                    });

                    return (
                      <li key={member.id} className="px-4 py-3">
                        <p className="truncate text-sm font-semibold text-white">{member.fullName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {member.memberCode} · Due{' '}
                          <span className="font-semibold text-red-200">
                            {formatCurrency(member.duesMinor, currency)}
                          </span>
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Link
                            href={`/dashboard/payments/collect?memberId=${member.id}`}
                            onClick={() => setIsOpen(false)}
                            className="inline-flex h-8 items-center rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-semibold text-accent transition hover:bg-accent/20"
                          >
                            Settle
                          </Link>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-semibold text-success transition hover:bg-success/20"
                            >
                              <WhatsAppIcon />
                              Remind
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {expired.length ? (
              <section>
                <h3 className="bg-surface/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Expired ({expired.length})
                </h3>
                <ul className="divide-y divide-border/50">
                  {expired.map((member) => {
                    const waUrl = buildRenewalWhatsAppUrl({
                      expiredOn: member.expiresOn,
                      gymName,
                      memberName: member.fullName,
                      phoneNumber: member.phoneNumber,
                    });

                    return (
                      <li key={member.id} className="px-4 py-3">
                        <p className="truncate text-sm font-semibold text-white">{member.fullName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {member.memberCode} · Expired {formatDateKey(member.expiresOn)}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRenewTarget({
                                fullName: member.fullName,
                                id: member.id,
                                lastAmountMinor: member.lastAmountMinor,
                                memberCode: member.memberCode,
                              });
                              setIsOpen(false);
                            }}
                            className="inline-flex h-8 items-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-400/20"
                          >
                            ⚡ Quick Renew
                          </button>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-semibold text-success transition hover:bg-success/20"
                            >
                              <WhatsAppIcon />
                              Remind
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
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
