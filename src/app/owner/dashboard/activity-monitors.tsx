import Link from 'next/link';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';

export type CollectionEntry = {
  amountMinor: number;
  id: string;
  memberName: string;
  staffName: string;
  tender: 'CASH' | 'UPI' | 'SPLIT';
  time: string;
};

export type ExpenseEntry = {
  amountMinor: number;
  category: string;
  id: string;
  note: string | null;
  staffName: string;
  time: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
      {children}
    </h2>
  );
}

/** Tender is a fact about the money, so it reads as a quiet label, not a colour. */
function TenderBadge({ tender }: { tender: CollectionEntry['tender'] }) {
  return (
    <span
      data-testid="tender-badge"
      className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
    >
      {tender}
    </span>
  );
}

/**
 * Last five settled payments today.
 *
 * Read-only: the owner is checking that money is arriving and who took it, not
 * approving anything. Anything older lives in the shift log.
 */
export function RecentCollections({ entries }: { entries: CollectionEntry[] }) {
  return (
    <section className="min-w-0">
      <SectionTitle>{copy.home.recentTitle}</SectionTitle>

      {entries.length ? (
        <>
          <ul data-testid="collections-list">
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-testid="collection-row"
                className="flex h-[50px] min-w-0 items-center gap-3 border-b border-zinc-800/60"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-100">
                  {entry.memberName}
                </span>
                <span className="shrink-0 font-mono text-base font-bold tabular-nums text-zinc-100">
                  {formatMoney(entry.amountMinor)}
                </span>
                <TenderBadge tender={entry.tender} />
                <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">
                  {entry.time}
                </span>
                <span className="hidden max-w-[9rem] shrink-0 truncate text-xs text-zinc-500 lg:inline">
                  {copy.home.collectedBy(entry.staffName)}
                </span>
              </li>
            ))}
          </ul>

          <Link
            href="/owner/staff"
            data-testid="view-shift-log"
            className="mt-2 inline-block text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            {copy.home.viewShiftLog}
          </Link>
        </>
      ) : (
        <p data-testid="collections-empty" className="py-2 text-xs text-zinc-500">
          {copy.home.recentEmpty}
        </p>
      )}
    </section>
  );
}

/**
 * Today's cash out.
 *
 * Deliberately has no Approve or Reject control. Approval gates were removed:
 * the owner monitors what the desk spent, and questions it in person. A voucher
 * that needs a decision is a conversation, not a workflow state.
 */
export function TodaysExpenses({ entries }: { entries: ExpenseEntry[] }) {
  return (
    <section className="min-w-0">
      <SectionTitle>{copy.home.expensesTitle}</SectionTitle>

      {entries.length ? (
        <ul data-testid="expenses-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="expense-row"
              className="flex h-[50px] min-w-0 items-center gap-3 border-b border-zinc-800/60"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="text-[15px] font-semibold text-zinc-100">
                  {copy.expenses.categories[entry.category] ?? entry.category}
                </span>
                {entry.note ? (
                  <span className="ml-2 text-xs text-zinc-500">{entry.note}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-base font-bold tabular-nums text-zinc-100">
                {formatMoney(entry.amountMinor)}
              </span>
              <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{entry.time}</span>
              <span className="hidden max-w-[9rem] shrink-0 truncate text-xs text-zinc-500 lg:inline">
                {copy.home.loggedBy(entry.staffName)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="expenses-empty" className="py-2 text-xs text-zinc-500">
          {copy.home.expensesEmpty}
        </p>
      )}
    </section>
  );
}
