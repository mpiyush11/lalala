import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ActionPageHeader } from '@/app/dashboard/action-page-header';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { CheckInForm } from './check-in-form';

export const metadata: Metadata = { title: 'Member Check-in' };
export const dynamic = 'force-dynamic';

export default async function CheckInPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('is_attendance_enabled')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  if (tenantError || !tenant) throw new Error('Unable to load attendance settings.');
  if (!tenant.is_attendance_enabled) redirect('/dashboard?attendance=disabled');

  const { data: members, error } = await supabase
    .from('members')
    .select('id, full_name, member_code, phone_number')
    .eq('tenant_id', currentUser.tenantId)
    .eq('status', 'active')
    .order('full_name');

  if (error) throw new Error('Unable to load active members.');

  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        title="Check-in member"
        description="Search active members and securely record today's attendance."
      />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <CheckInForm members={members ?? []} tenantId={currentUser.tenantId} />
      </main>
    </div>
  );
}
