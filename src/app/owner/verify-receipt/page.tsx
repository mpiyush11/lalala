import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FileCheck } from 'lucide-react';

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
    // Executive measure: a single search field stretched across ~1000px reads
    // as a form that lost its layout, and the dossier below it is a narrow
    // column of label/value pairs.
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <FileCheck aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
          {copy.pages.verifyBill.heading}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{copy.pages.verifyBill.subtitle}</p>
      </header>

      <ReceiptChecker timeZone={tenant?.timezone ?? 'Asia/Kolkata'} />
    </div>
  );
}
