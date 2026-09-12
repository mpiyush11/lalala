'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { buildRenewalWhatsAppUrl } from '@/lib/notifications/whatsapp';
import { describeExpiry, formatDateKey, formatTimestampDate } from '@/lib/format/expiry';

import { EarlyResumeAction } from './early-resume-action';
import { FreezePlanForm } from './freeze-plan-form';
import { formatMoney as formatCurrency } from '@/lib/format/currency';

export type LedgerPayment = {
  amountMinor: number;
  currency: string;
  id: string;
  method: string;
  paidAt: string | null;
  periodEndsOn: string | null;
  periodStartsOn: string | null;
  renewalKind: string | null;
  status: string;
};

export type LedgerMember = {
  balanceDueMinor: number;
  freezeStartedOn: string | null;
  freezeResumesOn: string | null;
  expiresOn: string;
  fullName: string;
  id: string;
  memberCode: string;
  phoneNumber: string;
  startedOn: string;
  status: string;
};

const PLAN_BADGE: Record<string, { className: string; label: string }> = {
  continuous_renewal: { className: 'bg-success/10 text-success', label: 'Renewal' },
  due_cleared: { className: 'bg-amber-400/10 text-amber-300', label: 'Due Cleared' },
  fresh_renewal: { className: 'bg-accent/10 text-accent', label: 'Fresh Start' },
  new_registration: { className: 'bg-accent/10 text-accent', label: 'Joining' },
};

/** `DD MMM YYYY, h:mm am` — date part uses the canonical formatter. */
function formatTimestamp(value: string): string {
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
  }).format(new Date(value));

  return `${formatTimestampDate(value)}, ${time}`;
}

/**
 * Member Ledger & Activity slide-over.
 *
 * Read-focused by design: the raw contact-edit fields that used to live here
 * were removed, so the drawer is a clean ledger rather than a mini edit form.
 */
export function MemberLedgerDrawer({
  currency,
  gymName,
  member,
  payments,
  pendingDuesMinor,
  tenantId,
  todayKey,
}: {
  currency: string;
  gymName: string;
  member: LedgerMember;
  payments: LedgerPayment[];
  pendingDuesMinor: number;
  tenantId: string;
  todayKey: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);

  // Returning to the directory without the ?member param closes the drawer.
  const close = useCallback(() => {
    // Unwind our pushed entry; the popstate handler performs the navigation.
    if (typeof window !== 'undefined' && window.history.state?.gymosSheet) {
      window.history.back();
      return;
    }

    router.replace('/dashboard/members', { scroll: false });
  }, [router]);

  // Android hardware back / back-swipe should dismiss the sheet rather than
  // leave the directory. A shallow history entry is pushed on open and popped
  // on close, so the gesture maps to "close" exactly once.
  useEffect(() => {
    window.history.pushState({ gymosSheet: true }, '');

    function onPopState() {
      // History already moved back; return to the directory without popping again.
      router.replace('/dashboard/members', { scroll: false });
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('keydown', onKeyDown);
    // Prevent the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const expiry = describeExpiry(todayKey, member.expiresOn);
  const isExpired = expiry.tone === 'expired';
  const whatsAppUrl = buildRenewalWhatsAppUrl({
    expiredOn: formatDateKey(member.expiresOn),
    gymName,
    memberName: member.fullName,
    phoneNumber: member.phoneNumber,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      {/* Backdrop: clicking anywhere outside the panel dismisses. */}
      <button
        type="button"
        aria-label="Close member ledger"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm animate-fade-in"
      />

      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-title"
        className="animate-sheet-up relative flex h-[85vh] w-full flex-col rounded-t-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl outline-none sm:h-full sm:max-w-md sm:animate-none sm:rounded-none sm:border-0 sm:border-l md:max-w-lg"
      >
        {/* Drag indicator: signals a dismissible bottom sheet on touch devices. */}
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-2.5 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>
        {/* Fixed header */}
        <header className="sticky top-0 z-10 shrink-0 border-b border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Member Ledger &amp; Activity
              </p>
              <h2 id="ledger-title" className="mt-1.5 truncate text-xl font-bold text-white">
                {member.fullName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                  {member.memberCode}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    member.status === 'paused'
                      ? 'bg-amber-400/10 text-amber-300'
                      : isExpired
                        ? 'bg-danger/10 text-danger'
                        : 'bg-success/10 text-success'
                  }`}
                >
                  {member.status === 'paused' ? 'Paused' : isExpired ? 'Expired' : 'Active'}
                </span>
                {member.balanceDueMinor > 0 ? (
                  <span
                    data-testid="ledger-due-badge"
                    className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-danger"
                  >
                    ⚠ Due {formatCurrency(member.balanceDueMinor, currency)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {whatsAppUrl ? (
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`WhatsApp ${member.fullName}`}
                  aria-label={`WhatsApp ${member.fullName}`}
                  className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-success/30 bg-success/10 text-success transition hover:bg-success/20 sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
                  </svg>
                </a>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-zinc-700/80 bg-zinc-950/60 text-lg text-slate-300 transition hover:text-white sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 sm:text-base"
              >
                ✕
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable body: inner containment keeps the panel usable at any zoom. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-28 pt-5 sm:pb-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <dt className="text-xs text-slate-500">Plan started</dt>
              <dd className="mt-1 font-semibold text-white">{formatDateKey(member.startedOn)}</dd>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <dt className="text-xs text-slate-500">Expires on</dt>
              <dd className="mt-1 font-semibold text-white">{formatDateKey(member.expiresOn)}</dd>
            </div>
            <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <dt className="text-xs text-slate-500">Membership</dt>
              <dd className="mt-1.5">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${expiry.className}`}>
                  {expiry.label}
                </span>
              </dd>
            </div>
            <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <dt className="text-xs text-slate-500">Pending dues</dt>
              <dd
                className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  pendingDuesMinor > 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {pendingDuesMinor > 0
                  ? formatCurrency(pendingDuesMinor, currency)
                  : '✓ All dues settled'}
              </dd>
            </div>
          </dl>

          {member.status === 'paused' && member.freezeResumesOn ? (
            <p
              data-testid="paused-notice"
              className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs font-semibold text-amber-300"
            >
              ⏸ Membership Paused until {formatDateKey(member.freezeResumesOn)}
            </p>
          ) : null}

          {member.status === 'paused' ? (
            <div className="mt-4">
              <EarlyResumeAction
                currentExpiry={member.expiresOn}
                freezeStartedOn={member.freezeStartedOn}
                freezeResumesOn={member.freezeResumesOn}
                memberId={member.id}
                status={member.status}
                tenantId={tenantId}
                todayKey={todayKey}
              />
            </div>
          ) : null}

          {member.status !== 'paused' ? (
          <div className="mt-4">
            <FreezePlanForm
              currentExpiry={member.expiresOn}
              memberId={member.id}
              status={member.status}
              tenantId={tenantId}
              todayKey={todayKey}
            />
          </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/payments/collect?memberId=${member.id}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-4 text-sm font-bold text-accent transition hover:bg-accent/25"
            >
              ⚡ Renew Plan
            </Link>
            {pendingDuesMinor > 0 ? (
              <Link
                href={`/dashboard/payments/collect?memberId=${member.id}`}
                className="inline-flex h-10 items-center rounded-lg border border-danger/40 bg-danger/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-danger/20"
              >
                Settle Due
              </Link>
            ) : null}
          </div>

          <section className="mt-7">
            <h3 className="text-sm font-bold text-white">Payment history</h3>
            <div className="mt-3 space-y-2">
              {payments.length ? (
                payments.map((payment) => {
                  const badge = payment.renewalKind
                    ? PLAN_BADGE[payment.renewalKind]
                    : undefined;

                  return (
                    <article
                      key={payment.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-base font-bold tabular-nums text-white">
                            {formatCurrency(payment.amountMinor, payment.currency)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {payment.paidAt ? formatTimestamp(payment.paidAt) : 'Unpaid'} ·{' '}
                            <span className="uppercase">{payment.method}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {payment.status === 'pending' ? (
                            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase text-danger">
                              Pending
                            </span>
                          ) : badge ? (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}>
                              {badge.label}
                            </span>
                          ) : null}
                          {payment.status === 'paid' ? (
                            <a
                              href={`/dashboard/payments/receipt/${payment.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-accent hover:underline"
                            >
                              🧾 Receipt
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {payment.periodStartsOn && payment.periodEndsOn ? (
                        <p className="mt-2 border-t border-zinc-800 pt-2 font-mono text-[11px] text-slate-500">
                          {formatDateKey(payment.periodStartsOn)} → {formatDateKey(payment.periodEndsOn)}
                        </p>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-xs text-slate-500">
                  No payment history yet.
                </p>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
