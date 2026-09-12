import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { AttendanceToggle } from './attendance-toggle';
import { CashOutSheet } from './cash-out-sheet';
import { LeadsWidget, type DeskLead } from './leads-widget';
import { DeskSearch, type SearchableMember } from './desk-search';
import { getTodayRange, localDateKey } from './date-range';
import { MobileBottomNav, MobileBottomNavSpacer } from './mobile-bottom-nav';
import { ProfileMenu } from './profile-menu';
import { ClampedList } from '@/components/clamped-list';
import { MicroTile } from '@/components/micro-tile';
import { formatMoney as formatCurrency } from '@/lib/format/currency';
import {
  NotificationBell,
  type DefaulterAlert,
  type ExpiredAlert,
} from './notification-bell';

export const metadata: Metadata = {
  title: 'Reception Dashboard',
};

export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  searchParams: {
    attendance?: string;
    auth_error?: string;
  };
};

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

const iconClassName = 'h-5 w-5';

function StatCard({
  accent,
  children,
  icon,
  label,
  value,
}: {
  accent: 'cyan' | 'emerald' | 'crimson' | 'amber';
  children: ReactNode;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const accentClasses = {
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    crimson: 'border-danger/25 bg-danger/10 text-danger',
    cyan: 'border-accent/25 bg-accent/10 text-accent',
    emerald: 'border-success/25 bg-success/10 text-success',
  } as const;

  return (
    <article className="rounded-2xl border border-border/70 bg-surface p-5 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-border">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${accentClasses[accent]}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      <div className="mt-2 text-xs text-slate-500">{children}</div>
    </article>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect('/login');
  }

  if (currentUser.role === 'superadmin') {
    redirect('/superadmin');
  }

  const supabase = await createClient();
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('name, currency, timezone, is_attendance_enabled')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  if (tenantError || !tenant) {
    throw new Error('Unable to load the active gym.');
  }

  const todayRange = getTodayRange(tenant.timezone);
  const todayKey = localDateKey(tenant.timezone);
  // "Within the next 48 hours" is inclusive of today, so the window covers
  // today, tomorrow, and the day after in tenant-local calendar terms.
  const expiryWindowEndKey = localDateKey(tenant.timezone, 2);

  const [
    activeMembersResult,
    todayAttendanceResult,
    todayPaymentsResult,
    expiringMembersResult,
    memberDirectoryResult,
    pendingPaymentsResult,
    leadsResult,
    expensesResult,
    settledPaymentsResult,
  ] = await Promise.all([
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'active'),
    supabase
      .from('attendance')
      .select('id, member_id, checked_in_at, checked_out_at')
      .eq('tenant_id', currentUser.tenantId)
      .gte('checked_in_at', todayRange.start)
      .lt('checked_in_at', todayRange.end)
      .order('checked_in_at', { ascending: false }),
    supabase
      .from('payments')
      .select('amount_minor, method, cash_minor, upi_minor')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'paid')
      .gte('paid_at', todayRange.start)
      .lt('paid_at', todayRange.end),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', currentUser.tenantId)
      .neq('status', 'inactive')
      .gte('membership_expires_on', todayKey)
      .lte('membership_expires_on', expiryWindowEndKey),
    supabase
      .from('members')
      .select('id, full_name, member_code, phone_number, membership_expires_on')
      .eq('tenant_id', currentUser.tenantId)
      .order('full_name'),
    supabase
      .from('payments')
      .select('member_id, amount_minor')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'pending'),
    supabase
      .from('leads')
      .select('id, full_name, phone_number, source, goal, request, status, created_at')
      .eq('tenant_id', currentUser.tenantId)
      .in('status', ['new', 'contacted'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expenses')
      .select('amount_minor')
      .eq('tenant_id', currentUser.tenantId)
      .gte('spent_at', todayRange.start)
      .lt('spent_at', todayRange.end),
    // Most recent settled payment per member powers the Quick Renew prefill.
    supabase
      .from('payments')
      .select('member_id, amount_minor, paid_at')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(500),
  ]);

  const queryError =
    activeMembersResult.error ??
    todayAttendanceResult.error ??
    todayPaymentsResult.error ??
    expiringMembersResult.error ??
    memberDirectoryResult.error ??
    pendingPaymentsResult.error ??
    leadsResult.error ??
    expensesResult.error ??
    settledPaymentsResult.error;

  if (queryError) {
    throw new Error('Unable to load dashboard activity.');
  }

  // --- Shift collection split -------------------------------------------------
  const todayPayments = todayPaymentsResult.data ?? [];
  // Split tenders record cash_minor/upi_minor explicitly; legacy rows fall back
  // to the single `method` column so historical totals stay correct.
  const cashMinor = todayPayments.reduce(
    (total, payment) =>
      total +
      (payment.cash_minor || payment.upi_minor
        ? payment.cash_minor
        : payment.method === 'cash'
          ? payment.amount_minor
          : 0),
    0,
  );
  const upiMinor = todayPayments.reduce(
    (total, payment) =>
      total +
      (payment.cash_minor || payment.upi_minor
        ? payment.upi_minor
        : payment.method === 'upi'
          ? payment.amount_minor
          : 0),
    0,
  );
  const deskLeads: DeskLead[] = (leadsResult.data ?? []).map((lead) => ({
    createdAt: lead.created_at,
    fullName: lead.full_name,
    goal: lead.goal,
    id: lead.id,
    phoneNumber: lead.phone_number,
    request: lead.request,
    source: lead.source,
    status: lead.status,
  }));

  const cashOutMinor = (expensesResult.data ?? []).reduce(
    (total, row) => total + row.amount_minor,
    0,
  );
  const netDrawerMinor = cashMinor - cashOutMinor;
  const totalCollectedMinor = todayPayments.reduce(
    (total, payment) => total + payment.amount_minor,
    0,
  );

  // --- Outstanding dues per member -------------------------------------------
  const duesByMember = new Map<string, number>();
  for (const payment of pendingPaymentsResult.data ?? []) {
    duesByMember.set(
      payment.member_id,
      (duesByMember.get(payment.member_id) ?? 0) + payment.amount_minor,
    );
  }

  // Latest settled amount per member (rows arrive newest-first).
  const lastAmountByMember = new Map<string, number>();
  for (const payment of settledPaymentsResult.data ?? []) {
    if (!lastAmountByMember.has(payment.member_id)) {
      lastAmountByMember.set(payment.member_id, payment.amount_minor);
    }
  }

  const checkedInTodayIds = new Set(
    (todayAttendanceResult.data ?? []).map((row) => row.member_id),
  );

  // --- Member lookup index for search + feed ----------------------------------
  function resolveStatus(expiresOn: string): SearchableMember['status'] {
    if (expiresOn < todayKey) return 'expired';
    if (expiresOn <= expiryWindowEndKey) return 'expiring';
    return 'active';
  }

  const searchableMembers: SearchableMember[] = (memberDirectoryResult.data ?? []).map(
    (member) => ({
      checkedInToday: checkedInTodayIds.has(member.id),
      duesMinor: duesByMember.get(member.id) ?? 0,
      expiresOn: member.membership_expires_on,
      fullName: member.full_name,
      id: member.id,
      lastAmountMinor: lastAmountByMember.get(member.id) ?? null,
      memberCode: member.member_code,
      phoneNumber: member.phone_number,
      status: resolveStatus(member.membership_expires_on),
    }),
  );

  const memberById = new Map(searchableMembers.map((member) => [member.id, member]));

  // --- Notification centre feeds --------------------------------------------
  // Actionable = unpaid dues, plus members expired within the last 7 days.
  const sevenDaysAgoKey = localDateKey(tenant.timezone, -7);

  const defaulterAlerts: DefaulterAlert[] = searchableMembers
    .filter((member) => member.duesMinor > 0)
    .sort((a, b) => b.duesMinor - a.duesMinor)
    .map((member) => ({
      duesMinor: member.duesMinor,
      fullName: member.fullName,
      id: member.id,
      memberCode: member.memberCode,
      phoneNumber: member.phoneNumber,
    }));

  const expiredAlerts: ExpiredAlert[] = searchableMembers
    .filter(
      (member) =>
        member.status === 'expired' &&
        member.expiresOn >= sevenDaysAgoKey &&
        member.expiresOn < todayKey,
    )
    .sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))
    .map((member) => ({
      expiresOn: member.expiresOn,
      fullName: member.fullName,
      id: member.id,
      lastAmountMinor: member.lastAmountMinor,
      memberCode: member.memberCode,
      phoneNumber: member.phoneNumber,
    }));

  const attendanceRows = todayAttendanceResult.data ?? [];
  const presentCount = attendanceRows.filter((row) => !row.checked_out_at).length;

  const statusBadge = {
    active: { className: 'bg-success/10 text-success', label: 'Active' },
    expired: { className: 'bg-danger/10 text-danger', label: 'Expired' },
    expiring: { className: 'bg-amber-400/10 text-amber-300', label: 'Expiring Soon' },
  } as const;

  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent shadow-cyan-glow">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-white sm:text-base">{tenant.name}</p>
                <span className="hidden rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success sm:inline-flex">
                  Live
                </span>
              </div>
              {/* Staff subtitle is desktop-only; mobile keeps the bar single-line. */}
              <Link
                href="/staff-activity"
                title="View my activity"
                className="hidden truncate text-xs text-slate-500 transition hover:text-accent hover:underline sm:block"
              >
                {formatRole(currentUser.role)} · {currentUser.profile.full_name}
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Hub links live in the bottom tab bar on phones. */}
            <Link href="/dashboard/members" className="hidden h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-slate-300 transition hover:border-accent/40 hover:text-accent sm:inline-flex">
              Members
            </Link>
            <Link href="/dashboard/payments" className="hidden h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-slate-300 transition hover:border-accent/40 hover:text-accent md:inline-flex">
              Payments
            </Link>
            {currentUser.role === 'owner' ? (
              <Link
                href="/owner"
                data-testid="owner-cockpit-badge"
                className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-400/25 active:scale-[0.98] sm:h-10 sm:min-h-0 sm:text-sm"
              >
                👑<span className="hidden xs:inline sm:inline">Owner Cockpit</span>
              </Link>
            ) : null}
            <NotificationBell
              currency={tenant.currency}
              defaulters={defaulterAlerts}
              expired={expiredAlerts}
              gymName={tenant.name}
              tenantId={currentUser.tenantId}
            />
            <ProfileMenu
              fullName={currentUser.profile.full_name}
              gymName={tenant.name}
              role={currentUser.role}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {searchParams.auth_error === 'forbidden' ? (
          <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-danger/15 font-bold text-danger">!</span>
            You do not have permission to access that area. You have been returned to your dashboard.
          </div>
        ) : null}
        {searchParams.attendance === 'disabled' ? (
          <div role="status" className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-slate-300">
            Attendance is disabled for this gym. Ask an owner to enable it before recording check-ins.
          </div>
        ) : null}

        {/* Condensed greeting: no filler subtitle. */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Good day, {currentUser.profile.full_name.split(' ')[0]}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <CashOutSheet staffId={currentUser.user.id} tenantId={currentUser.tenantId} />
            {currentUser.role === 'owner' ? (
              <AttendanceToggle
                enabled={tenant.is_attendance_enabled}
                tenantId={currentUser.tenantId}
              />
            ) : null}
          </div>
        </div>

        {/* ROW 1 — Shift & operation metrics */}
        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">Shift and operation metrics</h2>

          {/* Mobile: 2x2 micro-tile grid + split cash/UPI strip. */}
          <div className="grid grid-cols-2 gap-2.5 sm:hidden" data-testid="mobile-metric-grid">
            <Link
              href="/dashboard/members?filter=active"
              data-testid="tile-active"
              className="block cursor-pointer transition active:scale-95"
            >
              <MicroTile
                tone="emerald"
                label="👥 Active"
                value={String(activeMembersResult.count ?? 0)}
                sub="members →"
              />
            </Link>
            <a
              href="#live-check-in-feed"
              data-testid="tile-ingym"
              className="block cursor-pointer transition active:scale-95"
            >
              <MicroTile
                tone="cyan"
                label="🟢 In Gym"
                value={tenant.is_attendance_enabled ? String(presentCount) : '—'}
                sub={tenant.is_attendance_enabled ? `${attendanceRows.length} check-ins ↓` : 'module off'}
              />
            </a>
            <Link
              href="/dashboard/payments?tab=outflow"
              data-testid="tile-drawer"
              className="block cursor-pointer transition active:scale-95"
            >
              <MicroTile
                tone="slate"
                label="💵 Net Drawer"
                value={formatCurrency(netDrawerMinor, tenant.currency)}
                sub={`In: ${formatCurrency(cashMinor, tenant.currency)} · Out: ${formatCurrency(cashOutMinor, tenant.currency)}`}
              />
            </Link>
            <Link
              href="/dashboard/members?filter=expiring"
              data-testid="expiring-tile-mobile"
              className="block cursor-pointer transition active:scale-95"
            >
              <MicroTile
                tone="amber"
                label="⚠️ Expiring"
                value={String(expiringMembersResult.count ?? 0)}
                sub="within 48 hours →"
              />
            </Link>
          </div>

          {/* Desktop: full stat cards unchanged. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/dashboard/members?filter=active" data-testid="tile-active-desktop" className="block cursor-pointer transition active:scale-95">
            <StatCard
              accent="emerald"
              label="Active Members"
              value={String(activeMembersResult.count ?? 0)}
              icon={<svg viewBox="0 0 24 24" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>}
            >
              Current active memberships
            </StatCard>
            </Link>

            <a href="#live-check-in-feed" data-testid="tile-ingym-desktop" className="block cursor-pointer transition active:scale-95">
            <StatCard
              accent="cyan"
              label="Today’s Attendance"
              value={tenant.is_attendance_enabled ? String(attendanceRows.length) : '—'}
              icon={<svg viewBox="0 0 24 24" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>}
            >
              {tenant.is_attendance_enabled ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,.8)]" />
                  {presentCount} currently in gym
                </span>
              ) : (
                'Attendance module is off'
              )}
            </StatCard>
            </a>

            <Link href="/dashboard/payments?tab=outflow" data-testid="tile-drawer-desktop" className="block cursor-pointer transition active:scale-95">
            <StatCard
              accent="emerald"
              label="Net Drawer Cash"
              value={formatCurrency(netDrawerMinor, tenant.currency)}
              icon={<svg viewBox="0 0 24 24" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18v12H3zM3 10h18M7 15h2" /></svg>}
            >
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>In: <span className="font-semibold text-slate-300">{formatCurrency(cashMinor, tenant.currency)}</span></span>
                <span>Out: <span className="font-semibold text-amber-300">{formatCurrency(cashOutMinor, tenant.currency)}</span></span>
                <span>UPI: <span className="font-semibold text-slate-300">{formatCurrency(upiMinor, tenant.currency)}</span></span>
              </span>
            </StatCard>
            </Link>

            <Link href="/dashboard/members?filter=expiring" data-testid="expiring-tile-desktop" className="block cursor-pointer transition active:scale-95">
            <StatCard
              accent="amber"
              label="Expiring Soon"
              value={String(expiringMembersResult.count ?? 0)}
              icon={<svg viewBox="0 0 24 24" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
            >
              <span className="inline-flex items-center gap-2">
                <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Action needed
                </span>
                Expires within 48 hours
              </span>
            </StatCard>
            </Link>
          </div>
        </section>

        {/* ROW 2 — Compact command bar: search + two actions */}
        <section className="mt-5" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="sr-only">Member search and quick actions</h2>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <DeskSearch
                attendanceEnabled={tenant.is_attendance_enabled}
                currency={tenant.currency}
                gymName={tenant.name}
                members={searchableMembers}
                tenantId={currentUser.tenantId}
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/dashboard/members/new"
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-5 text-sm font-bold text-accent transition hover:bg-accent/25 lg:flex-none"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Member
              </Link>
              <Link
                href="/dashboard/payments/collect"
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/15 px-5 text-sm font-bold text-success transition hover:bg-success/25 lg:flex-none"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Collect
              </Link>
            </div>
          </div>
        </section>

        {/* Public website enquiry funnel — above the check-in feed. */}
        <LeadsWidget gymName={tenant.name} leads={deskLeads} />

        {/* ROW 3 — Consolidated live desk feed */}
        {tenant.is_attendance_enabled ? (
          <section id="live-check-in-feed" className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-surface" aria-labelledby="feed-heading">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 id="feed-heading" className="font-bold text-white">Live Check-in &amp; Desk Feed</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Today’s check-ins · {attendanceRows.length} total · {presentCount} in gym
                </p>
              </div>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_12px_rgba(16,185,129,.7)]" aria-label="Live" />
            </div>

            {attendanceRows.length ? (
              <ClampedList label="Check-ins" testId="checkin-feed" className="divide-y divide-border/50">
                {attendanceRows.map((attendance) => {
                  const member = memberById.get(attendance.member_id);
                  const status = member?.status ?? 'active';
                  const badge = statusBadge[status];
                  const dues = member?.duesMinor ?? 0;
                  const needsAction = dues > 0 || status !== 'active';

                  return (
                    <div key={attendance.id} data-testid="checkin-row" className="flex items-center gap-3 px-5 py-4 transition hover:bg-surface-elevated/40">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                        {(member?.fullName ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-200">
                          {member?.fullName ?? 'Unknown member'}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {member?.memberCode ?? 'No member code'} · {formatTime(attendance.checked_in_at, tenant.timezone)}
                          {dues > 0 ? ` · Dues ${formatCurrency(dues, tenant.currency)}` : ''}
                        </p>
                      </div>
                      <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${attendance.checked_out_at ? 'bg-slate-700/60 text-slate-300' : 'bg-success/10 text-success'}`}>
                        {attendance.checked_out_at ? 'Completed' : 'In gym'}
                      </span>
                      {/* Compact inline pill: never a full-width drop row, so
                          every feed card keeps the same height. */}
                      {needsAction && member ? (
                        <Link
                          href={`/dashboard/payments/collect?memberId=${member.id}`}
                          data-testid="checkin-action-pill"
                          className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2.5 text-[11px] font-bold text-accent transition hover:bg-accent/20 active:scale-[0.98]"
                        >
                          {dues > 0 ? 'Collect' : 'Renew'}
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
              </ClampedList>
            ) : (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-border/70 bg-surface-elevated text-slate-500">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-300">No check-ins yet today</p>
                <p className="mt-1 text-xs text-slate-500">
                  Records will appear here as members arrive at the front desk.
                </p>
                <Link
                  href="/dashboard/check-in"
                  className="mt-5 inline-flex h-10 items-center rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-semibold text-accent transition hover:bg-accent/20"
                >
                  Record first check-in
                </Link>
              </div>
            )}
          </section>
        ) : null}
      </main>
      <MobileBottomNavSpacer />
      <MobileBottomNav />
    </div>
  );
}
