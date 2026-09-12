import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/server';

import { ReceiptChecker } from './receipt-checker';

export const metadata: Metadata = { title: 'Verify Member Bill' };
export const dynamic = 'force-dynamic';

export default async function OwnerVerifyReceiptPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  return (
    <>
      <header className="mb-5">
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          🧾 Verify Member Bill / Receipt
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {copy.pages.verifyBill.subtitle}
        </p>
      </header>

      <ReceiptChecker timeZone={tenant?.timezone ?? 'Asia/Kolkata'} />
    </>
  );
}
