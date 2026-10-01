import { Monitor } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import {
  RealtimeAuditLog,
  type CollectionEntry,
  type ExpenseEntry,
} from './activity-monitors';
import { MetricTiles, type CockpitMetrics } from './metric-tiles';
import { ShiftFloatCard } from './shift-float-card';

export const metadata: Metadata = { title: 'Owner Cockpit' };
export const dynamic = 'force-dynamic';

/** The stream is a glance, not a ledger; the shift log holds the rest. */
const RECENT_LIMIT = 5;

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Owner Home — a business monitor.
 *
 * Every control that asked the owner to *operate* the gym has moved off this
 * screen: the dues table lives at `/owner/dues`, expense approval gates are
 * gone entirely, and cash counting belongs to `/owner/staff`. What is left
 * answers one question in one glance — is money arriving, and where is it.
 */
export default async function OwnerDashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, timezone')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  const timeZone = tenant?.timezone ?? 'Asia/Kolkata';
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

  const [aggregateResult, paymentsResult, expensesResult, staffResult, shiftResult] =
    await Promise.all([
    // One server-side aggregate instead of reducing whole tables in Node.
    supabase.rpc('get_owner_dashboard_aggregates', { p_tenant_id: currentUser.tenantId }),
    supabase
      .from('payments')
      .select('id, member_id, amount_minor, cash_minor, upi_minor, method, paid_at, recorded_by')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'paid')
      .gte('paid_at', `${todayKey}T00:00:00Z`)
      .order('paid_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from('expenses')
      .select('id, amount_minor, category, note, recorded_by, spent_at')
      .eq('tenant_id', currentUser.tenantId)
      .neq('status', 'REJECTED')
      .gte('spent_at', `${todayKey}T00:00:00Z`)
      .order('spent_at', { ascending: false }),
    supabase.from('users').select('id, full_name').eq('tenant_id', currentUser.tenantId),
    // The float card needs the one OPEN shift; the layout already resolves the
    // on-desk name for the sidebar, but layout props do not reach this page.
    supabase
      .from('shifts')
      .select(
        'staff_id, opening_cash_minor, system_cash_in_minor, petty_expenses_minor, variance_minor',
      )
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'OPEN')
      .limit(1)
      .maybeSingle(),
  ]);

  const agg = aggregateResult.data?.[0];
  const staffById = new Map((staffResult.data ?? []).map((u) => [u.id, u.full_name]));

  // Expected cash is what the drawer should physically hold: opening float,
  // plus cash settled since, less anything paid out of it. Floored at zero so a
  // heavy payout day can never render a nonsensical negative figure.
  const openShift = shiftResult.data;
  const onDeskName = openShift?.staff_id ? (staffById.get(openShift.staff_id) ?? null) : null;
  const openingMinor = openShift?.opening_cash_minor ?? 0;
  const expectedMinor = Math.max(
    0,
    openingMinor + (openShift?.system_cash_in_minor ?? 0) - (openShift?.petty_expenses_minor ?? 0),
  );

  const firstName =
    currentUser.profile.full_name.split(' ')[0] || currentUser.profile.full_name;
  const deskLabel = onDeskName ? copy.home.deskLive(onDeskName) : copy.nav.deskStatusEmpty;

  const metrics: CockpitMetrics = {
    bankUpiTodayMinor: agg?.upi_today_minor ?? 0,
    cashDrawerMinor: agg?.drawer_cash_minor ?? 0,
    duesCount: agg?.dues_member_count ?? 0,
    duesTotalMinor: agg?.dues_total_minor ?? 0,
    revenueTodayMinor: agg?.collections_today_minor ?? 0,
  };

  // Resolve member names for just the handful of rows actually shown.
  const payments = paymentsResult.data ?? [];
  const memberIds = [...new Set(payments.map((p) => p.member_id))];
  const memberById = new Map<string, string>();

  if (memberIds.length) {
    const { data: members } = await supabase
      .from('members')
      .select('id, full_name')
      .eq('tenant_id', currentUser.tenantId)
      .in('id', memberIds);

    for (const member of members ?? []) memberById.set(member.id, member.full_name);
  }

  const collections: CollectionEntry[] = payments.map((payment) => {
    // Split tender is the source of truth; `method` only carries the dominant
    // tender for legacy single-mode rows.
    const isSplit = payment.cash_minor > 0 && payment.upi_minor > 0;
    const tender: CollectionEntry['tender'] = isSplit
      ? 'SPLIT'
      : payment.cash_minor > 0 || payment.upi_minor > 0
        ? payment.cash_minor > 0
          ? 'CASH'
          : 'UPI'
        : payment.method === 'upi'
          ? 'UPI'
          : 'CASH';

    return {
      amountMinor: payment.amount_minor,
      id: payment.id,
      memberName: memberById.get(payment.member_id) ?? 'Unknown member',
      occurredAt: payment.paid_at ?? '',
      staffName: staffById.get(payment.recorded_by) ?? 'Unknown staff',
      tender,
      time: payment.paid_at ? timeOf(payment.paid_at, timeZone) : '—',
    };
  });

  const expenses: ExpenseEntry[] = (expensesResult.data ?? []).map((expense) => ({
    amountMinor: expense.amount_minor,
    category: expense.category,
    id: expense.id,
    note: expense.note,
    occurredAt: expense.spent_at ?? '',
    staffName: staffById.get(expense.recorded_by) ?? 'Unknown staff',
    time: expense.spent_at ? timeOf(expense.spent_at, timeZone) : '—',
  }));

  return (
    <div className="space-y-5">
      {/* Executive greeting bar: who is looking, what they are looking at,
          and the way back to the counter. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {copy.home.greeting(firstName)}
          </h1>
          <p className="mt-1 truncate text-xs text-slate-400 sm:text-sm">
            {copy.home.operationsLine(tenant?.name ?? 'GymOS', deskLabel)}
          </p>
        </div>
        <Link
          href="/dashboard"
          data-testid="dashboard-switch-to-desk"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-surface-elevated px-3 text-xs font-medium text-slate-200 transition duration-200 hover:border-border hover:bg-surface-elevated/70"
        >
          <Monitor aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
          {copy.nav.menu.switchToDesk}
        </Link>
      </div>

      <MetricTiles metrics={metrics} />

      {/* Operational cockpit. 65/35 rather than an even split: the ledger
          carries five columns and needs the reading room, while float status is
          two rows and a pill. Stacks to one column below lg. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
        <RealtimeAuditLog collections={collections} expenses={expenses} />
        <ShiftFloatCard
          expectedMinor={expectedMinor}
          hasShift={Boolean(openShift)}
          openingMinor={openingMinor}
          varianceMinor={openShift?.variance_minor ?? null}
        />
      </div>
    </div>
  );
}
