import { Activity, Megaphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { AttendanceToggle } from './attendance-toggle';
import { CashOutSheet } from './cash-out-sheet';
import { CheckInSheet } from './check-in-sheet';
import { DeskPulse } from './desk-pulse';
import { LeadsWidget, type DeskLead } from './leads-widget';
import { DeskSearch, type SearchableMember } from './desk-search';
import { getTodayRange, localDateKey } from './date-range';
import { MobileBottomNav, MobileBottomNavSpacer } from './mobile-bottom-nav';
import { CollapsiblePanel } from './collapsible-panel';
import { ProfileMenu } from './profile-menu';
import { ClampedList } from '@/components/clamped-list';
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
      .select('id, member_id, amount_minor, method, cash_minor, upi_minor, paid_at')
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

  const checkInEntries = attendanceRows.map((row) => ({
    id: row.id,
    memberName: memberById.get(row.member_id)?.fullName ?? 'Unknown member',
    time: formatTime(row.checked_in_at, tenant.timezone),
  }));

  // Desk Pulse reads the dues map the page already builds, so it costs no
  // extra round trip: owing members are those with a pending balance.
  const owingMembers = searchableMembers.filter(
    (member) => (duesByMember.get(member.id) ?? 0) > 0,
  );
  const pulseDues = owingMembers
    .slice()
    .sort((a, b) => (duesByMember.get(b.id) ?? 0) - (duesByMember.get(a.id) ?? 0))
    .slice(0, 3)
    .map((member) => ({
      amountMinor: duesByMember.get(member.id) ?? 0,
      id: member.id,
      name: member.fullName,
      planLabel: member.expiresOn ? `Expires ${member.expiresOn}` : 'Outstanding balance',
    }));

  const pulseCollections = todayPayments.slice(0, 3).map((payment) => ({
    amountMinor: payment.amount_minor,
    memberId: payment.member_id,
    memberName: memberById.get(payment.member_id)?.fullName ?? 'Member',
    paymentId: payment.id,
    time: payment.paid_at ? formatTime(payment.paid_at, tenant.timezone) : '—',
  }));

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

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-10 lg:px-8">
        {searchParams.auth_error === 'forbidden' ? (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-danger/15 font-bold text-danger">!</span>
            You do not have permission to access that area. You have been returned to your dashboard.
          </div>
        ) : null}
        {searchParams.attendance === 'disabled' ? (
          <div role="status" className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-slate-300">
            Attendance is disabled for this gym. Ask an owner to enable it before recording check-ins.
          </div>
        ) : null}

        {/* Condensed greeting: no filler subtitle. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Good day, {currentUser.profile.full_name.split(' ')[0]}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {deskLeads.length ? (
              <Link
                href="/dashboard/members?filter=leads"
                data-testid="leads-badge"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-400/25"
              >
                <span aria-hidden="true">🔥</span>
                {deskLeads.length} New Leads
              </Link>
            ) : null}
            <CashOutSheet staffId={currentUser.user.id} tenantId={currentUser.tenantId} />
            {currentUser.role === 'owner' ? (
              // Check-in is automatic at the counter. The switch is an owner
              // setup control, so it stays out of the phone header where it
              // wrapped to a second row and bloated the first fold.
              <span className="hidden sm:block">
                <AttendanceToggle
                  enabled={tenant.is_attendance_enabled}
                  tenantId={currentUser.tenantId}
                />
              </span>
            ) : null}
          </div>
        </div>

        {/* Today at a glance.
            ORDER: below lg this sits AFTER the search. On a 780px screen the
            four cards cost ~220px, which pushed the search bar to y=472 — the
            one control a counter operator needs constantly was below the fold.
            At lg the metrics lead and the search follows: there is room for
            both above the fold, and the figures make the better page heading.

            Two shapes, because a phone and a desktop are not the same surface.
              < lg — bounded 2x2 cards. Bare type on a 360px screen has no
                     figure-ground relationship: the numbers float on the canvas
                     and read as unstyled HTML rather than an app.
              >= lg — type directly on the canvas. At desktop width the
                     whitespace around a figure does the grouping, and boxing
                     each number is the strongest "admin template" signal there
                     is. */}
        <section aria-labelledby="stats-heading" className="order-2 lg:order-1">
          <h2 id="stats-heading" className="sr-only">Today at a glance</h2>

          <div className="grid grid-cols-2 gap-2.5 lg:flex lg:flex-wrap lg:items-start lg:gap-x-12 lg:gap-y-8">
            <div
              data-testid="tile-active"
              className="metric-card rounded-card border border-border/40 bg-card p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
            >
              <p className="text-xs text-slate-500">Active members</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-white lg:text-4xl">
                {activeMembersResult.count ?? 0}
              </p>
            </div>

            <CheckInSheet
              entries={checkInEntries}
              present={tenant.is_attendance_enabled ? String(presentCount) : '—'}
              subtitle={
                tenant.is_attendance_enabled
                  ? `${attendanceRows.length} check-ins today`
                  : 'module off'
              }
            />

            <div
              data-testid="tile-drawer"
              className="metric-card rounded-card border border-border/40 bg-card p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
            >
              <p className="text-xs text-slate-500">Net drawer cash</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-white lg:text-4xl">
                {formatCurrency(netDrawerMinor, tenant.currency)}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-500">
                In {formatCurrency(cashMinor, tenant.currency)} · Out{' '}
                {formatCurrency(cashOutMinor, tenant.currency)}
              </p>
            </div>

            <div
              data-testid="expiring-tile-mobile"
              className="metric-card rounded-card border border-border/40 bg-card p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
            >
              <p className="text-xs text-slate-500">Expiring in 48h</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-amber-300 lg:text-4xl">
                {expiringMembersResult.count ?? 0}
              </p>
            </div>
          </div>
        </section>

        {/* The command bar. Search is the anchor — it is how a counter
            operator reaches a member, so it gets the largest target on the
            page. The two actions sit beneath it in restrained outline form;
            two filled blocks here would compete with the search. */}
        <section className="order-1 lg:order-2" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="sr-only">Member search and quick actions</h2>

          <DeskSearch
            attendanceEnabled={tenant.is_attendance_enabled}
            currency={tenant.currency}
            gymName={tenant.name}
            members={searchableMembers}
            tenantId={currentUser.tenantId}
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/members/new"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-border/70 px-4 text-sm font-medium text-slate-200 transition hover:border-border hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              New member
            </Link>
            <Link
              href="/dashboard/payments/collect"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-border/70 px-4 text-sm font-medium text-slate-200 transition hover:border-border hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Collect payment
            </Link>
          </div>
        </section>

        {/* order-3: without an explicit order this defaulted to 0 and sorted
            ABOVE the search, which is why reordering the search first still
            left it at y=490. Any flex child in an ordering context needs an
            explicit position or it silently jumps to the front. */}
        <div className="order-3">
          <DeskPulse
            collections={pulseCollections}
            dues={pulseDues}
            duesTotalCount={owingMembers.length}
          />
        </div>
      </main>
      <MobileBottomNavSpacer />
      <MobileBottomNav />
    </div>
  );
}
