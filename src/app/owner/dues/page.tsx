import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { daysUntil } from '@/lib/format/expiry';
import { createClient } from '@/lib/supabase/server';

import { DuesWorkbench, type DueMember } from './dues-workbench';

export const metadata: Metadata = { title: 'Dues' };
export const dynamic = 'force-dynamic';

/**
 * The recovery desk.
 *
 * Only members who actually owe are fetched, so the page cost scales with the
 * debt list rather than the roster.
 */
export default async function OwnerDuesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, timezone, upi_id')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  const timeZone = tenant?.timezone ?? 'Asia/Kolkata';
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

  const [membersResult, duesResult] = await Promise.all([
    supabase
      .from('members')
      .select('id, full_name, phone_number, balance_due_minor')
      .eq('tenant_id', currentUser.tenantId)
      .gt('balance_due_minor', 0),
    supabase
      .from('payments')
      .select('id, member_id, due_settlement_date')
      .eq('tenant_id', currentUser.tenantId)
      .gt('balance_due_minor', 0)
      .order('due_settlement_date', { ascending: true }),
  ]);

  // Attach each member's oldest open payment so a balance settles in one RPC.
  const pendingByMember = new Map<string, { dueOn: string | null; paymentId: string }>();
  for (const row of duesResult.data ?? []) {
    if (!pendingByMember.has(row.member_id)) {
      pendingByMember.set(row.member_id, {
        dueOn: row.due_settlement_date,
        paymentId: row.id,
      });
    }
  }

  const members: DueMember[] = (membersResult.data ?? [])
    .map((member) => {
      const pending = pendingByMember.get(member.id);
      const promised = pending?.dueOn ?? null;
      return {
        balanceMinor: member.balance_due_minor ?? 0,
        fullName: member.full_name,
        id: member.id,
        overdueDays: promised ? Math.max(0, -daysUntil(todayKey, promised)) : 0,
        pendingPaymentId: pending?.paymentId ?? null,
        phoneNumber: member.phone_number,
      };
    })
    .sort((a, b) => b.overdueDays - a.overdueDays || b.balanceMinor - a.balanceMinor);

  const gymName = tenant?.name ?? 'GymOS';
  const upiId =
    tenant?.upi_id?.trim() ||
    `${(tenant?.name ?? 'gymos').toLowerCase().replace(/[^a-z0-9]/g, '')}@upi`;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-zinc-100">{copy.dues.heading}</h1>
      <DuesWorkbench
        gymName={gymName}
        members={members}
        tenantId={currentUser.tenantId}
        upiId={upiId}
      />
    </div>
  );
}
