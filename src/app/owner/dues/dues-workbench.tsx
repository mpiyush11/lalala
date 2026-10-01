'use client';

import { useMemo, useState } from 'react';

import { CollectPaymentSheet, type CollectTarget } from '@/app/owner/dashboard/collect-payment-sheet';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { toWhatsAppNumber } from '@/lib/notifications/whatsapp';
import { useDebounced } from '@/lib/use-debounced';

/**
 * Inline WhatsApp mark.
 *
 * An SVG rather than the 💬 emoji: emoji depend on a system font that is not
 * guaranteed (it renders as a tofu box in several Android webviews and in
 * headless Chromium), and a primary recovery action cannot look broken.
 */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

export type DueMember = {
  balanceMinor: number;
  fullName: string;
  id: string;
  overdueDays: number;
  pendingPaymentId: string | null;
  phoneNumber: string;
};

/**
 * The full recovery desk.
 *
 * Rows are a two-column split rather than one flex line. The single-line layout
 * put name, status, amount and two actions on one axis, so at 360px the status
 * was the thing that lost — "14 days overdue" clipped to "14 d…", which is the
 * one number that decides who to chase first. Identity now owns the left column
 * and money owns the right, and each can wrap without starving the other.
 *
 * Filtering is client-side because the server already scoped the rows to
 * members who owe — typically tens, not thousands.
 */
export function DuesWorkbench({
  gymName,
  members,
  tenantId,
  upiId,
}: {
  gymName: string;
  members: DueMember[];
  tenantId: string;
  upiId: string;
}) {
  const [term, setTerm] = useState('');
  const [collecting, setCollecting] = useState<CollectTarget | null>(null);
  const debounced = useDebounced(term, 150);

  const visible = useMemo(() => {
    const query = debounced.trim().toLowerCase();
    if (!query) return members;

    const digits = query.replace(/\D/g, '');
    return members.filter(
      (member) =>
        member.fullName.toLowerCase().includes(query) ||
        (digits.length >= 3 && member.phoneNumber.replace(/\D/g, '').includes(digits)),
    );
  }, [debounced, members]);

  const total = visible.reduce((sum, member) => sum + member.balanceMinor, 0);

  return (
    <>
      {/* Side by side from 640px. On a phone the outstanding block stole enough
          width to clip the placeholder to "Search member by nar", so it moves
          to its own right-aligned line and the field gets the full row. */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={copy.search.placeholder}
          aria-label={copy.search.ariaLabel}
          data-testid="dues-search"
          className="order-2 w-full min-w-0 rounded-xl border border-border/70 bg-surface-elevated px-3.5 py-2.5 text-sm text-white outline-none transition placeholder-slate-500 focus:border-accent sm:order-1 sm:flex-1"
        />

        <div className="order-1 shrink-0 text-right sm:order-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {copy.home.outstandingTotal}
          </p>
          <p
            data-testid="dues-total"
            className="text-lg font-bold tracking-tight tabular-nums text-white sm:text-xl"
          >
            {formatMoney(total)}
          </p>
        </div>
      </div>

      {visible.length ? (
        <ul
          data-testid="dues-list"
          className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70 bg-surface"
        >
          {visible.map((member) => {
            const number = toWhatsAppNumber(member.phoneNumber);
            const message = copy.dues.whatsappMessage(
              member.fullName,
              formatMoney(member.balanceMinor),
              gymName,
              upiId,
            );
            const url = number
              ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
              : null;

            return (
              <li
                key={member.id}
                data-testid="due-row"
                className="group flex min-w-0 items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-elevated/40"
              >
                {/* LEFT — identity. min-w-0 lets the name truncate while the
                    badge below keeps its full text on its own line. */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white sm:text-base">
                    {member.fullName}
                  </p>
                  <p className="mt-1">
                    {member.overdueDays > 0 ? (
                      <span
                        data-testid="overdue-badge"
                        className="inline-block whitespace-nowrap rounded border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums tracking-wide text-rose-300"
                      >
                        {copy.dues.overdueDays(member.overdueDays)}
                      </span>
                    ) : (
                      <span className="inline-block whitespace-nowrap rounded border border-border/70 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        {copy.dues.noDate}
                      </span>
                    )}
                  </p>
                </div>

                {/* RIGHT — money and the two triggers, stacked so neither
                    squeezes the member's name. */}
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <p className="order-1 text-base font-bold tabular-nums text-white sm:order-none sm:w-24 sm:text-right sm:text-lg">
                    {formatMoney(member.balanceMinor)}
                  </p>

                  <div className="order-2 flex items-center gap-2 sm:order-none">
                    {url ? (
                      // Explicit square: h-7/w-7 height-matches the Collect
                      // button beside it and keeps the icon optically centred.
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={copy.dues.whatsapp}
                        aria-label={copy.dues.whatsapp}
                        data-testid="due-whatsapp"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-95"
                      >
                        <WhatsAppGlyph />
                      </a>
                    ) : null}

                    {member.pendingPaymentId ? (
                      <button
                        type="button"
                        data-testid="due-collect"
                        data-member-id={member.id}
                        onClick={() =>
                          setCollecting({
                            balanceMinor: member.balanceMinor,
                            fullName: member.fullName,
                            id: member.id,
                            pendingPaymentId: member.pendingPaymentId as string,
                          })
                        }
                        className="inline-flex items-center rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white transition-all hover:border-emerald-400 hover:bg-emerald-500 active:scale-95"
                      >
                        {copy.dues.collect}
                      </button>
                    ) : (
                      <a
                        href={`/dashboard/payments/collect?memberId=${member.id}`}
                        data-testid="due-collect"
                        data-member-id={member.id}
                        className="inline-flex items-center rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white transition-all hover:border-emerald-400 hover:bg-emerald-500 active:scale-95"
                      >
                        {copy.dues.collect}
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p data-testid="dues-empty" className="py-2 text-xs text-slate-500">
          {debounced.trim() ? copy.search.empty(debounced.trim()) : copy.dues.empty}
        </p>
      )}

      {collecting ? (
        <CollectPaymentSheet
          onClose={() => setCollecting(null)}
          target={collecting}
          tenantId={tenantId}
        />
      ) : null}
    </>
  );
}
