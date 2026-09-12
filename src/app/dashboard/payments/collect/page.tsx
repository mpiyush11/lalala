import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ActionPageHeader } from '@/app/dashboard/action-page-header';
import { localDateKey } from '@/app/dashboard/date-range';
import { getCurrentUser } from '@/lib/auth';
import { fetchActivePlans } from '@/lib/plans-server';
import { createClient } from '@/lib/supabase/server';

import { CollectPaymentForm } from './collect-payment-form';
import type { CollectMember } from './member-combobox';

export const metadata: Metadata = { title: 'Collect Payment' };
export const dynamic = 'force-dynamic';

export default async function CollectPaymentPage({
  searchParams,
}: {
  searchParams: { memberId?: string };
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  const plans = await fetchActivePlans(currentUser.tenantId);
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const [membersResult, pendingResult, tenantResult] = await Promise.all([
    supabase
      .from('members')
      .select('id, full_name, member_code, phone_number, membership_expires_on')
      .eq('tenant_id', currentUser.tenantId)
      .order('full_name'),
    supabase
      .from('payments')
      .select('id, member_id, amount_minor')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'pending')
      .order('created_at'),
    supabase
      .from('tenants')
      .select('name, currency, timezone')
      .eq('tenant_id', currentUser.tenantId)
      .single(),
  ]);

  if (membersResult.error || pendingResult.error || tenantResult.error || !tenantResult.data) {
    throw new Error('Unable to load payment collection data.');
  }

  const todayKey = localDateKey(tenantResult.data.timezone);

  // Aggregate outstanding balance per member; the first pending row is the one
  // settled when "Clear Due" is used.
  const pendingByMember: Record<string, { amountMinor: number; id: string }> = {};
  for (const payment of pendingResult.data ?? []) {
    const existing = pendingByMember[payment.member_id];
    pendingByMember[payment.member_id] = {
      amountMinor: (existing?.amountMinor ?? 0) + payment.amount_minor,
      id: existing?.id ?? payment.id,
    };
  }

  const members: CollectMember[] = (membersResult.data ?? []).map((member) => ({
    duesMinor: pendingByMember[member.id]?.amountMinor ?? 0,
    expiresOn: member.membership_expires_on,
    fullName: member.full_name,
    id: member.id,
    isLapsed: member.membership_expires_on < todayKey,
    memberCode: member.member_code,
    phoneNumber: member.phone_number,
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        mobileTitle="Collect"
        title="Collect payment"
        description="Search a member, then settle a pending due or renew their plan."
        showHubLinks={false}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <CollectPaymentForm
          currency={tenantResult.data.currency}
          gymName={tenantResult.data.name}
          initialMemberId={
            members.some((member) => member.id === searchParams.memberId)
              ? searchParams.memberId
              : undefined
          }
          members={members}
          pendingByMember={pendingByMember}
          plans={plans}
          tenantId={currentUser.tenantId}
          todayKey={todayKey}
        />
      </main>
    </div>
  );
}
