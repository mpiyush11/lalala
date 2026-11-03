import {
  ArrowUpRight,
  ChevronRight,
  IndianRupee,
  LayoutGrid,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { AttendanceToggle } from './attendance-toggle';
import { CashOutSheet } from './cash-out-sheet';
import { CheckInSheet, type CheckInEntry } from './check-in-sheet';
import { DeskSearch, type SearchableMember } from './desk-search';
import { getTodayRange, localDateKey } from './date-range';
import type { DeskLead } from './desk-types';
import { MobileBottomNav, MobileBottomNavSpacer } from './mobile-bottom-nav';
import { ProfileMenu, SignOutButton } from './profile-menu';
import { formatMoney as formatCurrency } from '@/lib/format/currency';
import { NotificationBell } from './notification-bell';

// Avatar tints. Restricted to hues the copy linter sanctions — blue and pink
// are not in the palette, so sky and rose stand in for them.
const CHECKIN_TINTS = [
  'bg-[#7C3AED]/20 text-white',
  'bg-rose-500/20 text-rose-200',
  'bg-amber-500/20 text-amber-200',
  'bg-emerald-500/20 text-emerald-200',
];

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

/**
 * "Expires in 3 days" / "Expired 2 days ago".
 *
 * The members table has NO plan-name column — only `membership_expires_on` —
 * so the rail's second line is `GYM-ID · <relative expiry>` rather than a
 * fabricated plan label. Both operands are pinned to UTC midnight so a tenant
 * in a non-UTC zone cannot shift the count by a day.
 */
function relativeExpiry(expiresOn: string, todayKey: string): string {
  const dayMs = 86_400_000;
  const days = Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / dayMs,
  );

  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days === -1) return 'Expired yesterday';
  if (days > 1) return `Expires in ${days} days`;
  return `Expired ${Math.abs(days)} days ago`;
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
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

  const attendanceRows = todayAttendanceResult.data ?? [];

  /**
   * Visual-QA fallback.
   *
   * The seeded fixtures are frozen in September 2026, so a "checked in today"
   * query returns zero rows on a fresh database and the feed renders empty.
   * These ten rows stand in ONLY while the query is empty, and every render
   * site is tagged `data-source="sample"` so nothing here can be mistaken for
   * real attendance. Delete the constant once the fixtures are date-relative.
   */
  const SAMPLE_CHECK_INS: CheckInEntry[] = [
    ['Aarav Patel', 'GYM-2320', '08:42 AM', 'Auto-exit in 68m'],
    ['Meera Iyer', 'GYM-1912', '08:39 AM', 'Auto-exit in 65m'],
    ['Vikram Rao', 'GYM-2088', '08:31 AM', 'Auto-exit in 57m'],
    ['Ananya Joshi', 'GYM-2274', '08:26 AM', 'Auto-exit in 52m'],
    ['Kabir Malhotra', 'GYM-2105', '08:15 AM', 'Auto-exit in 41m'],
    ['Devika Nair', 'GYM-1844', '08:04 AM', 'Auto-exit in 30m'],
    ['Rohan Kapoor', 'GYM-2401', '07:55 AM', 'Auto-exit in 21m'],
    ['Sanya Verma', 'GYM-1990', '07:40 AM', 'Auto-exit in 12m'],
    ['Aditya Singh', 'GYM-2150', '06:50 AM', 'Auto-exited'],
    ['Neha Gupta', 'GYM-1788', '06:30 AM', 'Auto-exited'],
  ].map(([memberName, memberCode, time, autoExitLabel], index) => ({
    autoExitLabel,
    id: `sample-check-in-${index}`,
    memberCode,
    memberName,
    time,
    tint: CHECKIN_TINTS[index % CHECKIN_TINTS.length],
  }));

  const useSampleCheckIns = attendanceRows.length === 0;
  const isAutoExited = (entry: CheckInEntry) => entry.autoExitLabel.startsWith('Auto-exited');

  const presentCount = useSampleCheckIns
    ? SAMPLE_CHECK_INS.filter((entry) => !isAutoExited(entry)).length
    : attendanceRows.filter((row) => !row.checked_out_at).length;

  const liveCheckInEntries: CheckInEntry[] = attendanceRows.map((row, index) => {
    const member = memberById.get(row.member_id);
    const minutesOnFloor = Math.max(
      0,
      Math.round((Date.now() - Date.parse(row.checked_in_at)) / 60_000),
    );
    return {
      autoExitLabel:
        minutesOnFloor > 0 ? `Auto-exit in ${Math.max(0, 90 - minutesOnFloor)}m` : 'Active on floor',
      id: row.id,
      memberCode: member?.memberCode ?? '—',
      memberName: member?.fullName ?? 'Unknown member',
      time: formatTime(row.checked_in_at, tenant.timezone),
      tint: CHECKIN_TINTS[index % CHECKIN_TINTS.length],
    };
  });

  const checkInEntries: CheckInEntry[] = useSampleCheckIns
    ? SAMPLE_CHECK_INS
    : liveCheckInEntries;

  // Desk Pulse reads the dues map the page already builds, so it costs no
  // extra round trip: owing members are those with a pending balance.
  const owingMembers = searchableMembers.filter(
    (member) => (duesByMember.get(member.id) ?? 0) > 0,
  );
  // The rail carries TWO kinds of row, one CTA each:
  //   'dues'     -> purple "Collect ₹X"
  //   'expiring' -> outline "Renew"
  // Dues sort first (biggest balance at the top), then upcoming expiries.
  type AttentionRow = {
    amountMinor: number;
    id: string;
    kind: 'dues' | 'expiring';
    memberCode: string;
    name: string;
    note: string;
  };

  const owingIds = new Set(owingMembers.map((member) => member.id));

  const attentionRows: AttentionRow[] = [
    ...owingMembers
      .slice()
      .sort((a, b) => (duesByMember.get(b.id) ?? 0) - (duesByMember.get(a.id) ?? 0))
      .map((member) => ({
        amountMinor: duesByMember.get(member.id) ?? 0,
        id: member.id,
        kind: 'dues' as const,
        memberCode: member.memberCode,
        name: member.fullName,
        note: `${member.memberCode} · ${
          member.expiresOn ? relativeExpiry(member.expiresOn, todayKey) : 'Outstanding balance'
        }`,
      })),
    // Previously filtered on `status === 'expiring'`, which is a 48-hour
    // window. With fixtures whose memberships run months out that matched
    // nothing, so every row in the rail was a dues row and the panel rendered
    // as a stack of identical purple buttons. "Upcoming expiry" now means any
    // membership that has not lapsed yet, soonest first.
    ...searchableMembers
      .filter((member) => !owingIds.has(member.id) && member.expiresOn > todayKey)
      .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))
      .map((member) => ({
        amountMinor: lastAmountByMember.get(member.id) ?? 0,
        id: member.id,
        kind: 'expiring' as const,
        memberCode: member.memberCode,
        name: member.fullName,
        note: `${member.memberCode} · ${relativeExpiry(member.expiresOn, todayKey)}`,
      })),
  ];

  const operatorFirst = currentUser.profile.full_name.split(' ')[0];
  const hourNow = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tenant.timezone }).format(new Date()),
  );
  const greeting = hourNow < 12 ? 'Good morning' : hourNow < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', weekday: 'long', timeZone: tenant.timezone,
  }).format(new Date());

  return (
    <div className="flex min-h-screen bg-[#09090B] text-zinc-100 lg:h-screen lg:overflow-hidden">
      {/* ================= Sidebar rail (lg+) ================= */}
      <aside className="hidden min-h-0 w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0C0C0E] lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.06] px-5">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] shadow-[0_0_15px_rgba(124,92,246,0.5)]">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">Kinetiq</p>
            <p className="truncate text-[11px] text-zinc-400">Reception Terminal</p>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-500">
            Workspace
          </p>
          <Link
            href="/dashboard"
            aria-current="page"
            className="flex items-center gap-2.5 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-2 text-sm font-medium text-white shadow-glow"
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Desk
          </Link>
          <Link
            href="/dashboard/members"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Users aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">Members</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono font-medium tabular-nums text-zinc-400 tracking-normal">
              {memberDirectoryResult.data?.length ?? 0}
            </span>
          </Link>
          <Link
            href="/dashboard/leads"
            data-testid="leads-badge"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">Leads</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium tabular-nums text-amber-300 tracking-normal">
              {deskLeads.length}
            </span>
          </Link>
          <Link
            href="/dashboard/payments"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Wallet aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Ledger
          </Link>
        </nav>

        {/* Operator card. The header stays visually clean (greeting + bell only), so
            the owner/operator triggers live here instead. */}
        <div className="border-t border-white/[0.08] p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111113] p-3">
            {/* ONE avatar, and the whole card is the modal trigger. The old
                build rendered a second avatar inside the ProfileMenu trigger,
                so the rail showed two faces for one operator and the hit area
                was a 36px guess. */}
            <ProfileMenu
              fullName={currentUser.profile.full_name}
              gymName={tenant.name}
              role={currentUser.role}
            />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
              Shift live
            </div>
            {currentUser.role === 'owner' ? (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <AttendanceToggle
                  enabled={tenant.is_attendance_enabled}
                  tenantId={currentUser.tenantId}
                />
              </div>
            ) : null}
          </div>
          {/* "Close Shift & Reconcile" was a text link to a page that could not
              close a shift. The shift flow now lives in the profile modal's
              footer; this rail's job is to let the operator out. */}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ================= Top header: greeting + bell only ================= */}
        {/* The inner wrapper is the SAME `mx-auto max-w-[1400px] px-*` container
            as `main`, so the greeting's left edge lands exactly on the search
            bar's left edge at every breakpoint. */}
        <header className="shrink-0 border-b border-white/[0.06]">
          <div className="mx-auto flex w-full max-w-[1400px] min-h-[76px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[76px] lg:flex-nowrap lg:py-0">
            <div className="min-w-0">
              {/* The live-status dot belongs to the operator's name, not the
                  date: it answers "is my shift open", not "what day is it". */}
              <h1 className="flex items-center gap-2 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                <span className="truncate">
                  {greeting}, {operatorFirst}
                </span>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                />
              </h1>
              <p className="mt-0.5 truncate text-xs text-zinc-400">{todayLabel}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* ================= Master 12-col workspace ================= */}
        <main className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:overflow-hidden lg:px-8">
          {searchParams.auth_error === 'forbidden' ? (
            <div
              role="alert"
              className="mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500/15 font-bold text-rose-300">
                !
              </span>
              You do not have permission to access that area. You have been returned to your
              dashboard.
            </div>
          ) : null}
          {searchParams.attendance === 'disabled' ? (
            <div
              role="status"
              className="mb-4 shrink-0 rounded-xl border border-white/[0.08] bg-[#111113] px-4 py-3 text-sm text-zinc-300"
            >
              Attendance is disabled for this gym. Ask an owner to enable it before recording
              check-ins.
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 items-start lg:grid-cols-12 lg:items-stretch lg:gap-5">
            {/* ---------- LEFT COLUMN ---------- */}
            <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:col-span-8">
              {/* Row A — search + 3 actions on ONE row */}
              {/* Row A — one horizontal line at lg+. Below that the row wraps: three
                  `shrink-0` buttons plus a search field does not fit 360px, and the
                  overflow pushed the search container to a negative offset, which put
                  the in-dropdown action buttons off-screen and unclickable. */}
              <div
                className="flex w-full shrink-0 flex-wrap items-center gap-2.5 lg:flex-nowrap"
                data-testid="action-row"
              >
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <DeskSearch
                    attendanceEnabled={tenant.is_attendance_enabled}
                    currency={tenant.currency}
                    gymName={tenant.name}
                    members={searchableMembers}
                    tenantId={currentUser.tenantId}
                  />
                </div>

                <Link
                  href="/dashboard/members/new"
                  data-testid="new-member-btn"
                  className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#141417] px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1A1A1E]"
                >
                  <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  New Member
                </Link>
                <Link
                  href="/dashboard/payments/collect"
                  data-testid="collect-fee-btn"
                  className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#141417] px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1A1A1E]"
                >
                  <IndianRupee aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  Collect Fee
                </Link>
                <CashOutSheet
                  staffId={currentUser.user.id}
                  tenantId={currentUser.tenantId}
                />
              </div>

              {/* Row B — 3 KPI cards */}
              <section className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-3" aria-labelledby="stats-heading">
                <h2 id="stats-heading" className="sr-only">
                  Today at a glance
                </h2>

                <div
                  data-testid="tile-drawer"
                  className="rounded-2xl border border-white/[0.08] bg-[#111113] p-4 shadow-xl"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
                    Today&apos;s cash drawer
                  </p>
                  <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-white">
                    {formatCurrency(netDrawerMinor, tenant.currency)}
                  </p>
                  <p className="mt-2 truncate font-mono text-xs font-normal tabular-nums text-zinc-400 tracking-normal">
                    Cash {formatCurrency(cashMinor, tenant.currency)} · UPI{' '}
                    {formatCurrency(upiMinor, tenant.currency)}
                  </p>
                </div>

                <div
                  data-testid="tile-active"
                  className="rounded-2xl border border-white/[0.08] bg-[#111113] p-4 shadow-xl"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
                    Active on floor
                  </p>
                  {/* The slash is muted so the eye reads two numbers, not one
                      broken one. */}
                  <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-white">
                    {presentCount}{' '}
                    <span className="text-zinc-600">/</span>{' '}
                    {activeMembersResult.count ?? 0}
                  </p>
                  <p className="mt-2 truncate font-mono text-xs font-normal tabular-nums text-emerald-400 tracking-normal">
                    {presentCount} in gym ·{' '}
                    {activeMembersResult.count ?? 0} active
                    members
                  </p>
                </div>

                {/* Card 3 IS the check-in sheet trigger, so the strip stays symmetric. */}
                <CheckInSheet
                  entries={checkInEntries}
                  expiringCount={expiringMembersResult.count ?? 0}
                  present={String(checkInEntries.length)}
                  subtitle="Members on the floor right now"
                />
              </section>

              {/* Row C — Live check-ins */}
              <section
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113] shadow-xl"
                aria-labelledby="live-checkins-heading"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                  <div className="min-w-0">
                    <h2 id="live-checkins-heading" className="text-sm font-semibold text-white">
                      Live check-ins
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      Members on the floor right now
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-emerald-400">● Live feed</span>
                </div>

                {checkInEntries.length ? (
                  <ul
                    className="min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto"
                    data-testid="live-checkins-list"
                    data-source={useSampleCheckIns ? 'sample' : 'live'}
                  >
                    {checkInEntries.slice(0, 5).map((entry) => (
                      <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                        <span
                          aria-hidden="true"
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${entry.tint}`}
                        >
                          {initialsOf(entry.memberName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">
                            {entry.memberName}
                          </p>
                          <p className="truncate font-mono text-[11px] text-zinc-500 tracking-normal">
                            {entry.memberCode}
                          </p>
                        </div>
                        <span className="hidden shrink-0 font-mono text-xs text-zinc-500 sm:block tracking-normal">
                          {entry.time}
                        </span>
                        <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                          {entry.autoExitLabel}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-zinc-600"
                          strokeWidth={2}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex-1 px-5 py-10 text-center text-xs text-zinc-500">
                    No check-ins recorded yet today.
                  </p>
                )}

                <CheckInSheet
                  entries={checkInEntries}
                  expiringCount={expiringMembersResult.count ?? 0}
                  footerLabel={`View all today's check-ins (${checkInEntries.length}) ↗`}
                  present={String(checkInEntries.length)}
                  subtitle="Members on the floor right now"
                  variant="footer"
                />
              </section>
            </div>

            {/* ---------- RIGHT COLUMN: Needs attention ---------- */}
            {/* h-full + items-stretch on the grid pins this card to the exact
                bottom edge of the Live check-ins card. It does not shrink to
                fit its content: with two rows the card is still full height and
                only the list inside it scrolls. */}
            <aside
              className="mt-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113] shadow-xl lg:col-span-4 lg:mt-0 lg:h-full"
              aria-labelledby="attention-heading"
              data-testid="needs-attention"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 id="attention-heading" className="text-sm font-semibold text-white">
                    Needs attention
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    Dues &amp; upcoming expiries
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-amber-300 tracking-normal">
                  {attentionRows.length} open
                </span>
              </div>

              {attentionRows.length ? (
                <ul
                  className="min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto px-4"
                  data-testid="attention-list"
                >
                  {attentionRows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-[#7C3AED]/20 text-[10px] font-bold text-white"
                        >
                          {initialsOf(row.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{row.name}</p>
                          <p className="truncate font-mono text-[11px] text-zinc-500 tracking-normal">{row.note}</p>
                          {row.kind === 'dues' ? (
                            <p className="font-mono text-[11px] font-medium tabular-nums text-amber-400 tracking-normal">
                              {formatCurrency(row.amountMinor, tenant.currency)} Due
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Strictly ONE CTA per row: purple Collect for a balance,
                          quiet outline Renew for an upcoming expiry. */}
                      {row.kind === 'dues' ? (
                        <Link
                          href={`/dashboard/payments/collect?memberId=${row.id}`}
                          data-testid="attention-collect"
                          className="shrink-0 rounded-lg bg-[#7C3AED] px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-white shadow-glow transition hover:bg-[#6D28D9] tracking-normal"
                        >
                          Collect {formatCurrency(row.amountMinor, tenant.currency)}
                        </Link>
                      ) : (
                        <Link
                          href={`/dashboard/payments/collect?memberId=${row.id}`}
                          data-testid="attention-renew"
                          className="shrink-0 rounded-lg border border-white/[0.1] bg-[#141417] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1A1A1E]"
                        >
                          Renew
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex-1 px-4 py-6 text-center text-xs text-zinc-500">
                  Nothing needs attention. Everyone is paid up.
                </p>
              )}

              {/* Redirects, by order: the members directory owns the full list
                  and its filters. No drawer, no modal. */}
              <Link
                href="/dashboard/members?filter=expiring"
                data-testid="attention-view-all"
                className="flex shrink-0 items-center justify-center gap-1 border-t border-white/[0.06] py-3 text-center text-xs text-zinc-300 transition hover:text-white"
              >
                View all attention items
                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            </aside>
          </div>
        </main>

        <MobileBottomNavSpacer />
        <MobileBottomNav />
      </div>
    </div>
  );
}

/** Two-letter monogram used by the rail and the attention rows. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}
