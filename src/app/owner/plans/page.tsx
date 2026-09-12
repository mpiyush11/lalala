import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/server';

import { PlansManager, type PlanRow } from './plans-manager';

export const metadata: Metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

/**
 * Master pricing controller.
 *
 * Inactive plans are shown here (unlike reception, which only sees sellable
 * ones) so an owner can bring a seasonal rate back without recreating it.
 */
export default async function OwnerPlansPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase
    .from('membership_plans')
    .select('id, name, duration_months, price_minor, is_active')
    .eq('tenant_id', currentUser.tenantId)
    .order('is_active', { ascending: false })
    .order('duration_months', { ascending: true });

  const plans: PlanRow[] = (data ?? []).map((row) => ({
    durationMonths: row.duration_months,
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    priceMinor: row.price_minor,
  }));

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-zinc-100">{copy.plans.title}</h1>
      <PlansManager plans={plans} tenantId={currentUser.tenantId} />
    </div>
  );
}
