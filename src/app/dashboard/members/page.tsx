import type { Metadata } from 'next';
import { LayoutGrid, Sparkles, UserPlus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import {
  MemberDirectoryTable,
  type DirectoryFilter,
  type DirectoryLead,
  type DirectoryMember,
} from './member-directory-table';
import { MemberLedgerDrawer, type LedgerPayment } from './member-ledger-drawer';
import { MobileBottomNav, MobileBottomNavSpacer } from '@/app/dashboard/mobile-bottom-nav';
import { ProfileMenu, SignOutButton } from '@/app/dashboard/profile-menu';

export const metadata: Metadata = { title: 'Member Directory' };
export const dynamic = 'force-dynamic';

type MemberDirectoryProps = {
  searchParams: { filter?: string; member?: string; q?: string };
};

function tenantDate(timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      day: '2-digit', month: '2-digit', timeZone, year: 'numeric',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default async function MemberDirectoryPage({ searchParams }: MemberDirectoryProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const [tenantResult, membersResult, pendingResult, leadsResult] = await Promise.all([
    supabase.from('tenants').select('name, timezone, currency').eq('tenant_id', currentUser.tenantId).single(),
    supabase.from('members').select('*').eq('tenant_id', currentUser.tenantId).order('full_name').limit(1000),
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
      .limit(50),
  ]);
  if (tenantResult.error || !tenantResult.data || membersResult.error) {
    throw new Error('Unable to load member directory.');
  }

  // Per-member outstanding, so the Dues tab can filter without a second trip.
  const duesByMember = new Map<string, number>();
  for (const payment of pendingResult.data ?? []) {
    if (!payment.member_id) continue;
    duesByMember.set(
      payment.member_id,
      (duesByMember.get(payment.member_id) ?? 0) + payment.amount_minor,
    );
  }

  const directoryLeads: DirectoryLead[] = (leadsResult.data ?? []).map((lead) => ({
    createdAt: lead.created_at,
    fullName: lead.full_name,
    goal: lead.goal,
    id: lead.id,
    phoneNumber: lead.phone_number,
    request: lead.request,
    source: lead.source,
  }));

  const today = tenantDate(tenantResult.data.timezone);
  const filter: DirectoryFilter = ['active', 'expiring', 'expired', 'dues', 'leads'].includes(
    searchParams.filter ?? '',
  )
    ? (searchParams.filter as DirectoryFilter)
    : 'all';
  const allMembers = membersResult.data ?? [];

  const directoryMembers: DirectoryMember[] = allMembers.map((member) => ({
    duesMinor: duesByMember.get(member.id) ?? 0,
    expiresOn: member.membership_expires_on,
    fullName: member.full_name,
    id: member.id,
    memberCode: member.member_code,
    phoneNumber: member.phone_number,
    status: member.status,
  }));

  const selectedMember = allMembers.find((member) => member.id === searchParams.member) ?? null;
  const paymentResult = selectedMember
    ? await supabase
        .from('payments')
        .select('id, amount_minor, currency, method, status, paid_at, created_at, renewal_kind, period_starts_on, period_ends_on')
        .eq('tenant_id', currentUser.tenantId)
        .eq('member_id', selectedMember.id)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [], error: null };
  if (paymentResult.error) throw new Error('Unable to load member payment history.');

  const pendingDuesMinor = (paymentResult.data ?? [])
    .filter((payment) => payment.status === 'pending')
    .reduce((total, payment) => total + payment.amount_minor, 0);

  const ledgerPayments: LedgerPayment[] = (paymentResult.data ?? []).map((payment) => ({
    amountMinor: payment.amount_minor,
    currency: payment.currency,
    id: payment.id,
    method: payment.method,
    paidAt: payment.paid_at,
    periodEndsOn: payment.period_ends_on,
    periodStartsOn: payment.period_starts_on,
    renewalKind: payment.renewal_kind,
    status: payment.status,
  }));

  return (
    <div className="flex min-h-screen bg-[#09090B] text-zinc-100">
      {/* Sidebar rail, reused from the Desk shell so both views read as one app. */}
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
            aria-current="page"
            data-testid="leads-badge"
            className="flex items-center gap-2.5 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-2 text-sm font-medium text-white"
          >
            <Users aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">Members</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono font-medium tabular-nums text-zinc-400 tracking-normal">
              {allMembers.length}
            </span>
          </Link>
          <Link
            href="/dashboard/leads"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">Leads</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium tabular-nums text-amber-300 tracking-normal">
              {directoryLeads.length}
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

        <div className="border-t border-white/[0.08] p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111113] p-3">
            {/* ONE avatar. The old build rendered a monogram here and a second
                one inside the profile trigger, so the rail showed two faces for
                one operator. The whole card is the modal trigger. */}
            <ProfileMenu
              fullName={currentUser.profile.full_name}
              gymName={tenantResult.data.name}
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
        {/* Top bar, matching the Desk header. */}
        <header className="shrink-0 border-b border-white/[0.08]">
          <div className="mx-auto flex w-full max-w-[1400px] min-h-[76px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[76px] lg:flex-nowrap lg:py-0">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                Members
              </h1>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate">{allMembers.length} on file · Shift live</span>
              </p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <MemberDirectoryTable
            filter={filter}
            gymName={tenantResult.data.name}
            leads={directoryLeads}
            members={directoryMembers}
            staffId={currentUser.user.id}
            tenantId={currentUser.tenantId}
            todayKey={today}
          />
        </main>

        {selectedMember ? (
          <MemberLedgerDrawer
            currency={tenantResult.data.currency}
            gymName={tenantResult.data.name}
            member={{
              balanceDueMinor: selectedMember.balance_due_minor ?? 0,
              freezeStartedOn: selectedMember.freeze_started_on ?? null,
              freezeResumesOn: selectedMember.freeze_resumes_on ?? null,
              expiresOn: selectedMember.membership_expires_on,
              fullName: selectedMember.full_name,
              id: selectedMember.id,
              memberCode: selectedMember.member_code,
              phoneNumber: selectedMember.phone_number,
              startedOn: selectedMember.membership_started_on,
              status: selectedMember.status,
            }}
            payments={ledgerPayments}
            pendingDuesMinor={pendingDuesMinor}
            tenantId={currentUser.tenantId}
            todayKey={today}
          />
        ) : null}

        <MobileBottomNavSpacer />
        <MobileBottomNav />
      </div>
    </div>
  );
}

