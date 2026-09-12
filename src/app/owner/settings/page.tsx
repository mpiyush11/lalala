import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/server';

import { TenantSettingsForm } from './tenant-settings-form';

export const metadata: Metadata = { title: 'Gym Settings' };
export const dynamic = 'force-dynamic';

export default async function OwnerSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('name, slug, phone, email, timezone, currency, address, support_phone, upi_id')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  if (error || !tenant) throw new Error('Unable to load gym settings.');

  return (
    <>
      <header className="mb-5">
        <h1 className="text-xl font-bold text-white sm:text-2xl">⚙️ Gym Settings &amp; Branding</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {copy.pages.settings.brandingSubtitle}
        </p>
      </header>

      <TenantSettingsForm
        initial={{
          address: tenant.address ?? '',
          supportPhone: tenant.support_phone ?? tenant.phone ?? '',
          upiId: tenant.upi_id ?? '',
        }}
        readOnly={{
          currency: tenant.currency,
          email: tenant.email ?? '—',
          name: tenant.name,
          slug: tenant.slug,
          timezone: tenant.timezone,
        }}
        tenantId={currentUser.tenantId}
      />
    </>
  );
}
