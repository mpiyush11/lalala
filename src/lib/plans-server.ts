import 'server-only';

import { toMembershipPlan, type MembershipPlan } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

/**
 * Loads a tenant's active plan catalogue for the reception forms.
 *
 * Server-side so the price list is resolved once per render rather than by
 * every browser, and so RLS (not a client filter) is what scopes the rows to
 * the tenant. Inactive plans are excluded: an owner deactivates a plan
 * precisely so the desk can no longer sell it, while historic payments that
 * referenced it stay intact.
 */
export async function fetchActivePlans(tenantId: string): Promise<MembershipPlan[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('membership_plans')
    .select('id, name, duration_months, price_minor, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('duration_months', { ascending: true });

  if (error || !data) return [];

  return data.map(toMembershipPlan);
}
