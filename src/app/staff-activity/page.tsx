import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ActionPageHeader } from '@/app/dashboard/action-page-header';
import { MobileBottomNav, MobileBottomNavSpacer } from '@/app/dashboard/mobile-bottom-nav';
import { ClampedList } from '@/components/clamped-list';
import { MicroTile } from '@/components/micro-tile';
import { compactMoney, formatTimestampDate } from '@/lib/format/expiry';

import { SignOutButton } from './sign-out-button';
import { getTodayRange } from '@/app/dashboard/date-range';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatMoney as formatCurrency } from '@/lib/format/currency';

export const metadata: Metadata = { title: 'My Activity' };
export const dynamic = 'force-dynamic';

type ActionType = 'New Registration' | 'Renewal' | 'Due Cleared' | 'Payment';

const ACTION_STYLES: Record<ActionType, string> = {
  'Due Cleared': 'bg-danger/10 text-red-200',
  'New Registration': 'bg-accent/10 text-accent',
  Payment: 'bg-slate-700/60 text-slate-300',
  Renewal: 'bg-success/10 text-success',
};

function classifyAction(renewalKind: string | null): ActionType {
  switch (renewalKind) {
    case 'new_registration':
      return 'New Registration';
    case 'continuous_renewal':
    case 'fresh_renewal':
      return 'Renewal';
    case 'due_cleared':
      return 'Due Cleared';
    default:
      return 'Payment';
  }
}

/** `DD MMM YYYY, h:mm am` in the tenant timezone. */
function formatDateTime(value: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));

  return `${formatTimestampDate(value, timeZone)}, ${time}`;
}

function MetricCard({
  accent,
  children,
  label,
  value,
}: {
  accent: 'cyan' | 'emerald' | 'amber' | 'slate';
  children?: ReactNode;
  label: string;
  value: string;
}) {
  const accents = {
    amber: 'text-amber-300',
    cyan: 'text-accent',
    emerald: 'text-success',
    slate: 'text-white',
  } as const;

  return (
    <article className="rounded-2xl border border-border/70 bg-surface p-5">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className={`mt-3 text-3xl font-bold tracking-tight ${accents[accent]}`}>{value}</p>
      {children ? <div className="mt-2 text-xs text-slate-500">{children}</div> : null}
    </article>
  );
}

export default async function StaffActivityPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const staffId = currentUser.user.id;
  const supabase = await createClient();

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('name, currency, timezone')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  if (tenantError || !tenant) throw new Error('Unable to load the active gym.');

  const todayRange = getTodayRange(tenant.timezone);

  // Every query is tenant-scoped AND narrowed to this staff member's own
  // actions. RLS still enforces the tenant boundary independently.
  const [onboardedResult, paymentsResult, shiftResult] = await Promise.all([
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', currentUser.tenantId)
      .eq('created_by', staffId),
    supabase
      .from('payments')
      .select('id, member_id, amount_minor, method, status, renewal_kind, gap_reason, gap_days, paid_at, created_at')
      .eq('tenant_id', currentUser.tenantId)
      .eq('recorded_by', staffId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(100),
    supabase
      .from('payments')
      .select('amount_minor, method')
      .eq('tenant_id', currentUser.tenantId)
      .eq('recorded_by', staffId)
      .eq('status', 'paid')
      .gte('paid_at', todayRange.start)
      .lt('paid_at', todayRange.end),
  ]);

  if (onboardedResult.error || paymentsResult.error || shiftResult.error) {
    throw new Error('Unable to load staff activity.');
  }

  const payments = paymentsResult.data ?? [];
  const memberIds = [...new Set(payments.map((row) => row.member_id))];
  const membersResult = memberIds.length
    ? await supabase
        .from('members')
        .select('id, full_name, member_code')
        .eq('tenant_id', currentUser.tenantId)
        .in('id', memberIds)
    : { data: [], error: null };

  if (membersResult.error) throw new Error('Unable to load member details.');

  const memberById = new Map((membersResult.data ?? []).map((m) => [m.id, m]));

  const shiftRows = shiftResult.data ?? [];
  const shiftCash = shiftRows
    .filter((row) => row.method === 'cash')
    .reduce((total, row) => total + row.amount_minor, 0);
  const shiftUpi = shiftRows
    .filter((row) => row.method === 'upi')
    .reduce((total, row) => total + row.amount_minor, 0);

  const allTimeTotal = payments.reduce((total, row) => total + row.amount_minor, 0);
  const renewalsHandled = payments.filter(
    (row) => row.renewal_kind === 'continuous_renewal' || row.renewal_kind === 'fresh_renewal',
  ).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        mobileTitle="Shift Ledger"
        title="My activity"
        description="Your personal onboarding and collection ledger."
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-lg font-bold text-accent">
            {currentUser.profile.full_name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{currentUser.profile.full_name}</h2>
            <p className="text-xs text-slate-500">
              {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)} · {tenant.name}
            </p>
          </div>
        </div>

        {/* Mobile: 2x2 micro-tiles. */}
        {/* Sign out sits with the profile card so it is never buried under feeds. */}
        <div className="mb-5 sm:hidden">
          <SignOutButton />
        </div>

        <section className="grid grid-cols-2 gap-2.5 sm:hidden" data-testid="staff-mobile-tiles">
          <MicroTile tone="cyan" label="👥 Onboarded" value={String(onboardedResult.count ?? 0)} sub="members" />
          <MicroTile tone="emerald" label="🔄 Renewals" value={String(renewalsHandled)} sub="handled" />
          <MicroTile tone="amber" label="💵 Shift" value={formatCurrency(shiftCash + shiftUpi, tenant.currency)} sub={`Cash: ${compactMoney(shiftCash)} · UPI: ${compactMoney(shiftUpi)}`} />
          <MicroTile tone="slate" label="🧾 All-time" value={formatCurrency(allTimeTotal, tenant.currency)} sub={`${payments.length} txns`} />
        </section>

        <section className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            accent="cyan"
            label="Members Onboarded"
            value={String(onboardedResult.count ?? 0)}
          >
            Profiles you created
          </MetricCard>

          <MetricCard accent="emerald" label="Renewals Handled" value={String(renewalsHandled)}>
            Plan renewals processed
          </MetricCard>

          <MetricCard
            accent="amber"
            label="Today’s Shift Collection"
            value={formatCurrency(shiftCash + shiftUpi, tenant.currency)}
          >
            <span className="flex flex-wrap gap-x-3">
              <span>
                Cash:{' '}
                <span className="font-semibold text-slate-300">
                  {formatCurrency(shiftCash, tenant.currency)}
                </span>
              </span>
              <span>
                UPI:{' '}
                <span className="font-semibold text-slate-300">
                  {formatCurrency(shiftUpi, tenant.currency)}
                </span>
              </span>
            </span>
          </MetricCard>

          <MetricCard
            accent="slate"
            label="All-time Collected"
            value={formatCurrency(allTimeTotal, tenant.currency)}
          >
            Across {payments.length} transaction{payments.length === 1 ? '' : 's'}
          </MetricCard>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-surface">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="font-bold text-white">Activity feed</h2>
            <p className="mt-1 text-xs text-slate-500">
              Chronological record of actions you performed
            </p>
          </div>

          {payments.length ? (
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="bg-surface-elevated/50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Date / Time</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Member</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Action</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Amount</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Mode</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payments.slice(0, 5).map((row) => {
                    const member = memberById.get(row.member_id);
                    const action = classifyAction(row.renewal_kind);

                    return (
                      <tr key={row.id} className="transition hover:bg-surface-elevated/40">
                        <td className="whitespace-nowrap px-5 py-3 text-slate-400">
                          {formatDateTime(row.paid_at ?? row.created_at, tenant.timezone)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-semibold text-slate-200">
                            {member?.full_name ?? 'Unknown member'}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            {member?.member_code ?? ''}
                          </span>
                          {row.gap_reason ? (
                            <span className="mt-0.5 block text-xs text-amber-300">
                              Gap {row.gap_days}d · {row.gap_reason}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ACTION_STYLES[action]}`}>
                            {action}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-semibold text-white">
                          {formatCurrency(row.amount_minor, tenant.currency)}
                        </td>
                        <td className="px-5 py-3 uppercase text-slate-400">{row.method}</td>
                        <td className="px-5 py-3">
                          <Link
                            href={`/dashboard/payments/receipt/${row.id}`}
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {payments.length > 5 ? (
                <p className="border-t border-zinc-800 px-5 py-3 text-xs text-slate-500">
                  Showing latest 5 of {payments.length} actions
                </p>
              ) : null}
            </div>
          ) : (
            <p className="px-5 py-14 text-center text-sm text-slate-500">
              No activity recorded yet. Registrations and payments you handle will appear here.
            </p>
          )}

          {/* Mobile: vertical action cards. */}
          {payments.length ? (
            <ClampedList label="History" testId="staff-card-feed" className="divide-y divide-zinc-800 sm:hidden">
              {payments.map((row) => {
                const member = memberById.get(row.member_id);
                const action = classifyAction(row.renewal_kind);
                return (
                  <div key={row.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ACTION_STYLES[action]}`}>{action}</span>
                        <p className="mt-1.5 truncate font-semibold text-zinc-100">{member?.full_name ?? 'Unknown member'}</p>
                        <p className="mt-0.5 font-mono text-xs text-zinc-500">{member?.member_code ?? '—'}</p>
                      </div>
                      <p className="shrink-0 font-mono text-base font-bold tabular-nums text-white">{formatCurrency(row.amount_minor, tenant.currency)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">{formatTimestampDate(row.paid_at ?? row.created_at, tenant.timezone)}</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-300">{row.method}</span>
                    </div>
                    <Link href={`/dashboard/payments/receipt/${row.id}`} className="mt-2.5 flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/60 text-xs font-bold text-accent transition active:scale-[0.98]">🧾 View Receipt</Link>
                  </div>
                );
              })}
            </ClampedList>
          ) : null}
        </section>

      </main>
      <MobileBottomNavSpacer />
      <MobileBottomNav />
    </div>
  );
}
