import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import {
  RecentCollections,
  TodaysExpenses,
  type CollectionEntry,
  type ExpenseEntry,
} from './activity-monitors';
import { MetricTiles, type CockpitMetrics } from './metric-tiles';

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
    .select('timezone')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  const timeZone = tenant?.timezone ?? 'Asia/Kolkata';
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

  const [aggregateResult, paymentsResult, expensesResult, staffResult] = await Promise.all([
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
  ]);

  const agg = aggregateResult.data?.[0];
  const staffById = new Map((staffResult.data ?? []).map((u) => [u.id, u.full_name]));

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
    staffName: staffById.get(expense.recorded_by) ?? 'Unknown staff',
    time: expense.spent_at ? timeOf(expense.spent_at, timeZone) : '—',
  }));

  return (
    <div className="space-y-5">
      <MetricTiles metrics={metrics} />
      <RecentCollections entries={collections} />
      <TodaysExpenses entries={expenses} />
    </div>
  );
}
