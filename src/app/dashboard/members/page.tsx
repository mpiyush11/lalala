import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionPageHeader } from '@/app/dashboard/action-page-header';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import {
  MemberDirectoryTable,
  type DirectoryFilter,
  type DirectoryMember,
} from './member-directory-table';
import { MemberLedgerDrawer, type LedgerPayment } from './member-ledger-drawer';
import { MobileBottomNav, MobileBottomNavSpacer } from '@/app/dashboard/mobile-bottom-nav';

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
  const [tenantResult, membersResult] = await Promise.all([
    supabase.from('tenants').select('name, timezone, currency').eq('tenant_id', currentUser.tenantId).single(),
    supabase.from('members').select('*').eq('tenant_id', currentUser.tenantId).order('full_name').limit(1000),
  ]);
  if (tenantResult.error || !tenantResult.data || membersResult.error) {
    throw new Error('Unable to load member directory.');
  }

  const today = tenantDate(tenantResult.data.timezone);
  const filter: DirectoryFilter = ['active', 'expiring', 'expired'].includes(searchParams.filter ?? '')
    ? (searchParams.filter as DirectoryFilter)
    : 'all';
  const allMembers = membersResult.data ?? [];

  const directoryMembers: DirectoryMember[] = allMembers.map((member) => ({
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

  const tabs: Array<{ id: DirectoryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'expiring', label: 'Expiring Soon' },
    { id: 'expired', label: 'Expired' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        mobileTitle="Members"
        title="Member directory"
        description="Search, filter, and review tenant-isolated member profiles."
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <MemberDirectoryTable
          filter={filter}
          gymName={tenantResult.data.name}
          members={directoryMembers}
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
  );
}
