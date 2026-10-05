import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { fetchActivePlans } from '@/lib/plans-server';
import { ActionPageHeader } from '@/app/dashboard/action-page-header';

import { NewMemberForm } from './new-member-form';

export const metadata: Metadata = { title: 'Register Member' };
export const dynamic = 'force-dynamic';

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: { name?: string; phone?: string };
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const plans = await fetchActivePlans(currentUser.tenantId);

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <ActionPageHeader
        isOwner={currentUser.role === 'owner'}
        mobileTitle="New Member"
        title="Register new member"
        description="Create a tenant-isolated profile and activate a membership plan."
      />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <NewMemberForm
          initialName={searchParams.name}
          initialPhone={searchParams.phone}
          plans={plans}
          tenantId={currentUser.tenantId}
        />
      </main>
    </div>
  );
}
