'use client';

import { useMemo, useState } from 'react';

import { CollectPaymentSheet, type CollectTarget } from '@/app/owner/dashboard/collect-payment-sheet';
import { PillButton, PillLink } from '@/components/action-pill';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { toWhatsAppNumber } from '@/lib/notifications/whatsapp';
import { useDebounced } from '@/lib/use-debounced';

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
 * Everything that used to crowd the cockpit home screen lives here: the
 * complete list, the search, and the settlement sheet. Filtering is client-side
 * because the server already scoped the rows to members who owe — typically
 * tens, not thousands — so a round trip per keystroke would be wasted latency.
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={copy.search.placeholder}
          aria-label={copy.search.ariaLabel}
          data-testid="dues-search"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-zinc-600"
        />
        <span data-testid="dues-total" className="shrink-0 font-mono text-sm text-zinc-400">
          {formatMoney(total)}
        </span>
      </div>

      {visible.length ? (
        <ul data-testid="dues-list">
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
                className="flex h-[50px] min-w-0 items-center gap-3 border-b border-zinc-800/60"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[15px] font-semibold text-zinc-100">{member.fullName}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {member.overdueDays > 0
                      ? copy.dues.overdueDays(member.overdueDays)
                      : copy.dues.noDate}
                  </span>
                </span>

                <span className="shrink-0 font-mono text-base font-bold tabular-nums text-zinc-100">
                  {formatMoney(member.balanceMinor)}
                </span>

                {url ? (
                  <PillLink
                    external
                    icon
                    href={url}
                    testId="due-whatsapp"
                    title={copy.dues.whatsapp}
                    tone="quiet"
                  >
                    💬
                  </PillLink>
                ) : null}

                {member.pendingPaymentId ? (
                  <PillButton
                    tone="primary"
                    testId="due-collect"
                    data-member-id={member.id}
                    onClick={() =>
                      setCollecting({
                        balanceMinor: member.balanceMinor,
                        fullName: member.fullName,
                        id: member.id,
                        pendingPaymentId: member.pendingPaymentId as string,
                      })
                    }
                  >
                    {copy.dues.collect}
                  </PillButton>
                ) : (
                  <PillLink
                    href={`/dashboard/payments/collect?memberId=${member.id}`}
                    testId="due-collect"
                    tone="primary"
                    data-member-id={member.id}
                  >
                    {copy.dues.collect}
                  </PillLink>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p data-testid="dues-empty" className="py-2 text-xs text-zinc-500">
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
