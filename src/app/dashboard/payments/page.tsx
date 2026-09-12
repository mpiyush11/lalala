import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionPageHeader } from '@/app/dashboard/action-page-header';
import { MobileBottomNav, MobileBottomNavSpacer } from '@/app/dashboard/mobile-bottom-nav';
import { MicroTile } from '@/components/micro-tile';
import { getCurrentUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/server';

import { PaymentsHub, type InflowRow, type OutflowRow } from './payments-hub';

export const metadata: Metadata = { title: 'Payment Records' };
export const dynamic = 'force-dynamic';

function localDate(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      day: '2-digit', month: '2-digit', timeZone, year: 'numeric',
    }).formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const [tenantResult, paymentsResult, membersResult, expensesResult, staffResult] =
    await Promise.all([
      supabase.from('tenants').select('name, currency, timezone').eq('tenant_id', currentUser.tenantId).single(),
      supabase.from('payments').select('*').eq('tenant_id', currentUser.tenantId).eq('status', 'paid').order('paid_at', { ascending: false }).limit(1000),
      supabase.from('members').select('id, full_name, member_code').eq('tenant_id', currentUser.tenantId),
      supabase.from('expenses').select('id, amount_minor, category, note, spent_at, recorded_by').eq('tenant_id', currentUser.tenantId).order('spent_at', { ascending: false }).limit(200),
      supabase.from('users').select('id, full_name').eq('tenant_id', currentUser.tenantId),
    ]);

  if (
    tenantResult.error || !tenantResult.data ||
    paymentsResult.error || membersResult.error ||
    expensesResult.error || staffResult.error
  ) {
    throw new Error('Unable to load payment records.');
  }

  const tenant = tenantResult.data;
  const today = localDate(new Date(), tenant.timezone);
  const payments = paymentsResult.data ?? [];
  const expenses = expensesResult.data ?? [];

  const todayPayments = payments.filter(
    (payment) => payment.paid_at && localDate(new Date(payment.paid_at), tenant.timezone) === today,
  );

  // Split tenders carry explicit cash/upi columns; legacy rows fall back to the
  // single `method` so historical totals stay exact.
  const cashMinor = todayPayments.reduce(
    (sum, p) =>
      sum + (p.cash_minor || p.upi_minor ? p.cash_minor : p.method === 'cash' ? p.amount_minor : 0),
    0,
  );
  const upiMinor = todayPayments.reduce(
    (sum, p) =>
      sum + (p.cash_minor || p.upi_minor ? p.upi_minor : p.method === 'upi' ? p.amount_minor : 0),
    0,
  );
  const cashOutMinor = expenses
    .filter((expense) => localDate(new Date(expense.spent_at), tenant.timezone) === today)
    .reduce((sum, expense) => sum + expense.amount_minor, 0);
  const netDrawerMinor = cashMinor - cashOutMinor;

  const memberById = new Map((membersResult.data ?? []).map((m) => [m.id, m]));
  const staffById = new Map((staffResult.data ?? []).map((u) => [u.id, u.full_name]));

  const inflow: InflowRow[] = payments.map((payment) => ({
    amountMinor: payment.amount_minor,
    cashMinor: payment.cash_minor,
    currency: payment.currency,
    id: payment.id,
    memberCode: memberById.get(payment.member_id)?.member_code ?? '—',
    memberName: memberById.get(payment.member_id)?.full_name ?? 'Unknown member',
    method: payment.method,
    notes: payment.notes,
    paidAt: payment.paid_at,
    upiMinor: payment.upi_minor,
  }));

  const outflow: OutflowRow[] = expenses.map((expense) => ({
    amountMinor: expense.amount_minor,
    category: expense.category,
    id: expense.id,
    note: expense.note,
    spentAt: expense.spent_at,
    staffName: staffById.get(expense.recorded_by) ?? 'Staff',
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        mobileTitle="Payments"
        title="Payments"
        description="Reconcile today's cash and UPI collections and open verified receipts."
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Mobile: compact 2x2 tiles with exact figures. */}
        <div className="grid grid-cols-2 gap-2.5 sm:hidden" data-testid="payments-mobile-tiles">
          <MicroTile tone="emerald" label="💵 Cash In" value={formatMoney(cashMinor, tenant.currency)} sub="today" />
          <MicroTile tone="cyan" label="📲 UPI" value={formatMoney(upiMinor, tenant.currency)} sub="today" />
          <MicroTile tone="rose" label="📤 Cash Out" value={formatMoney(cashOutMinor, tenant.currency)} sub="today" />
          <MicroTile
            tone="slate"
            label="🧾 Net Drawer"
            value={formatMoney(netDrawerMinor, tenant.currency)}
            sub={`In: ${formatMoney(cashMinor, tenant.currency)} · Out: ${formatMoney(cashOutMinor, tenant.currency)}`}
          />
        </div>

        {/* Desktop: exact audit figures, no compact rounding. */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-3">
          <article className="rounded-2xl border border-success/20 bg-success/5 p-5">
            <p className="text-sm text-slate-400">Today&apos;s Cash Collection</p>
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-white">{formatMoney(cashMinor, tenant.currency)}</p>
            <p className="mt-2 text-xs text-success">Gross cash in</p>
          </article>
          <article className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
            <p className="text-sm text-slate-400">Today&apos;s UPI Collection</p>
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-white">{formatMoney(upiMinor, tenant.currency)}</p>
            <p className="mt-2 text-xs text-accent">Digital collection</p>
          </article>
          <article className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5" data-testid="net-drawer-card">
            <p className="text-sm text-slate-400">Net Drawer Cash</p>
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-white">{formatMoney(netDrawerMinor, tenant.currency)}</p>
            <p className="mt-2 font-mono text-xs text-slate-400">
              In: {formatMoney(cashMinor, tenant.currency)} · Out: {formatMoney(cashOutMinor, tenant.currency)} = Net:{' '}
              {formatMoney(netDrawerMinor, tenant.currency)}
            </p>
          </article>
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href="/dashboard/payments/collect"
            className="inline-flex h-11 min-h-[44px] items-center rounded-xl bg-accent px-4 text-sm font-bold text-slate-950 transition active:scale-[0.98]"
          >
            + Collect Payment
          </Link>
        </div>

        <PaymentsHub
          initialTab={searchParams.tab === 'outflow' ? 'out' : 'in'}
          currency={tenant.currency}
          inflow={inflow}
          outflow={outflow}
          timeZone={tenant.timezone}
        />
      </main>
      <MobileBottomNavSpacer />
      <MobileBottomNav />
    </div>
  );
}
