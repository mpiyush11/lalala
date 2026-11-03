import type { Metadata } from 'next';
import { LayoutGrid, Sparkles, UserPlus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { NotificationBell } from '../notification-bell';
import { MobileBottomNav, MobileBottomNavSpacer } from '../mobile-bottom-nav';
import { ProfileMenu, SignOutButton } from '../profile-menu';
import { LedgerTable } from './ledger-table';
import type { InflowRow, OutflowRow } from './payments-hub';

export const metadata: Metadata = { title: 'Payment Records' };
export const dynamic = 'force-dynamic';

function localDate(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', timeZone, year: 'numeric' })
      .formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default async function PaymentsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const [tenantResult, paymentsResult, membersResult, expensesResult, staffResult, shiftResult] =
    await Promise.all([
      supabase.from('tenants').select('name, currency, timezone').eq('tenant_id', currentUser.tenantId).single(),
      supabase.from('payments').select('*').eq('tenant_id', currentUser.tenantId).eq('status', 'paid').order('paid_at', { ascending: false }).limit(1000),
      supabase.from('members').select('id, full_name, member_code').eq('tenant_id', currentUser.tenantId),
      supabase.from('expenses').select('id, amount_minor, category, note, spent_at, recorded_by').eq('tenant_id', currentUser.tenantId).order('spent_at', { ascending: false }).limit(200),
      supabase.from('users').select('id, full_name').eq('tenant_id', currentUser.tenantId),
      // Opening float for the KPI "Opening ₹X" line. Added for the ledger view; no
      // existing query changed.
      supabase.from('shifts').select('opening_cash_minor').eq('tenant_id', currentUser.tenantId).eq('status', 'OPEN').limit(1).maybeSingle(),
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
    (sum, p) => sum + (p.cash_minor || p.upi_minor ? p.cash_minor : p.method === 'cash' ? p.amount_minor : 0),
    0,
  );
  const upiMinor = todayPayments.reduce(
    (sum, p) => sum + (p.cash_minor || p.upi_minor ? p.upi_minor : p.method === 'upi' ? p.amount_minor : 0),
    0,
  );
  const cashOutMinor = expenses
    .filter((expense) => localDate(new Date(expense.spent_at), tenant.timezone) === today)
    .reduce((sum, expense) => sum + expense.amount_minor, 0);
  const openingMinor = shiftResult.data?.opening_cash_minor ?? 0;

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

  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', timeZone: tenant.timezone,
  }).format(new Date());

  return (
    // SCROLL LOCK: shell is exactly viewport height and never scrolls. Only the
    // table body scrolls.
    <div className="flex h-screen overflow-hidden bg-[#09090B] text-zinc-100">
      {/* ================= Sidebar rail (lg+) ================= */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0C0C0E] lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.08] px-5">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] shadow-[0_0_15px_rgba(124,92,246,0.5)]">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">Kinetiq</p>
            <p className="truncate text-[11px] text-zinc-400">Reception Terminal</p>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-500">
            Workspace
          </p>
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Desk
          </Link>
          <Link
            href="/dashboard/members"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Users aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Members
          </Link>
          <Link
            href="/dashboard/leads"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Leads
          </Link>
          <Link
            href="/dashboard/payments"
            aria-current="page"
            className="flex items-center gap-2.5 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-2 text-sm font-medium text-white"
          >
            <Wallet aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Ledger
          </Link>
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111113] p-3">
            {/* ONE avatar. The old build rendered a monogram here and a second
                one inside the profile trigger, so the rail showed two faces for
                one operator. The whole card is the modal trigger. */}
            <ProfileMenu
              fullName={currentUser.profile.full_name}
              gymName={tenant.name}
              role={currentUser.role}
            />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
              Shift live
            </div>
          </div>
          {/* "Close Shift & Reconcile" was a link to a page that cannot close a
              shift. The shift flow lives in the profile modal's footer; this
              rail's job is to let the operator out. */}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ================= Top bar: title + bell only ================= */}
        <header className="shrink-0 border-b border-white/[0.08]">
          <div className="mx-auto flex w-full max-w-[1400px] min-h-[76px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[76px] lg:flex-nowrap lg:py-0">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                Ledger
              </h1>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate">{todayLabel} · Shift live</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* min-h-0 lets the inner scroller own the overflow instead of the page. */}
        <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <LedgerTable
            cashMinor={cashMinor}
            cashOutMinor={cashOutMinor}
            currency={tenant.currency}
            inflow={inflow}
            openingMinor={openingMinor}
            outflow={outflow}
            staffId={currentUser.user.id}
            tenantId={currentUser.tenantId}
            timezone={tenant.timezone}
          />
        </main>

        <MobileBottomNavSpacer />
        <MobileBottomNav />
      </div>
    </div>
  );
}

