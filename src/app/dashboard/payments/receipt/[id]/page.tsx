import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format/currency';
import { formatDateKey } from '@/lib/format/expiry';
import { createClient } from '@/lib/supabase/server';

import { ReceiptActions } from './receipt-actions';

export const metadata: Metadata = { title: 'Payment Receipt' };
export const dynamic = 'force-dynamic';

type ReceiptPageProps = { params: { id: string } };

function receiptNo(id: string): string {
  return `RCT-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export default async function PaymentReceiptPage({ params }: ReceiptPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: payment, error } = await supabase.from('payments').select('*').eq('tenant_id', currentUser.tenantId).eq('id', params.id).eq('status', 'paid').single();
  if (error || !payment) notFound();
  const [tenantResult, memberResult] = await Promise.all([
    supabase.from('tenants').select('name, timezone').eq('tenant_id', currentUser.tenantId).single(),
    supabase.from('members').select('full_name, member_code, phone_number, membership_expires_on').eq('tenant_id', currentUser.tenantId).eq('id', payment.member_id).single(),
  ]);
  if (tenantResult.error || !tenantResult.data || memberResult.error || !memberResult.data) notFound();

  const tenant = tenantResult.data;
  const member = memberResult.data;
  const amount = formatMoney(payment.amount_minor, payment.currency);
  const number = receiptNo(payment.id);

  // A split tender must never be labelled with a single method: `method` only
  // stores the dominant tender for legacy reporting, so the explicit
  // cash/upi columns are the source of truth here.
  const isSplit = payment.cash_minor > 0 && payment.upi_minor > 0;

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-zinc-100 print:bg-white print:text-black">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard/payments" className="mb-5 inline-flex text-sm font-semibold text-[#8B5CF6] print:hidden">← Payment records</Link>
        <article className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111113] shadow-2xl shadow-black/20 print:border-zinc-300 print:bg-white print:shadow-none">
          <header className="border-b border-white/[0.06] bg-[#141417]/50 p-6 text-center print:bg-white"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8B5CF6]">Digital payment receipt</p><h1 className="mt-3 text-2xl font-bold text-white print:text-black">{tenant.name}</h1><p className="mt-2 font-mono text-sm text-zinc-400 tracking-normal">{number}</p></header>
          <div className="p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-zinc-500">Member</p><p className="mt-1 font-semibold text-white print:text-black">{member.full_name}</p><p className="text-xs text-zinc-500">{member.member_code} · {member.phone_number}</p></div><div className="sm:text-right"><p className="text-xs text-zinc-500">Paid at</p><p className="mt-1 font-semibold text-white print:text-black">{payment.paid_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone }).format(new Date(payment.paid_at)) : '—'}</p></div></div>
            <div className="my-7 rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-6 text-center"><p className="text-xs uppercase tracking-wider text-zinc-500">Amount received</p><p className="mt-2 text-4xl font-bold text-white print:text-black">{amount}</p>{isSplit ? (
              <div className="mt-3">
                <span data-testid="tender-badge" className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Split
                </span>
                <p data-testid="tender-breakdown" className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">{formatMoney(payment.cash_minor, payment.currency)} Cash</span>
                  <span className="text-zinc-500">•</span>
                  <span className="rounded-full bg-[#7C3AED]/10 px-2.5 py-1 text-[#8B5CF6]">{formatMoney(payment.upi_minor, payment.currency)} UPI</span>
                </p>
              </div>
            ) : (
              <p data-testid="tender-badge" className="mt-2 text-sm font-semibold uppercase text-[#8B5CF6]">{payment.method}</p>
            )}</div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl bg-canvas/50 p-4 print:bg-zinc-50"><dt className="text-xs text-zinc-500">Next expiry date</dt><dd className="mt-1 font-semibold text-white print:text-black">{formatDateKey(member.membership_expires_on)}</dd></div><div className="rounded-xl bg-canvas/50 p-4 print:bg-zinc-50"><dt className="text-xs text-zinc-500">Notes</dt><dd className="mt-1 font-semibold text-white print:text-black">{payment.notes ?? 'No notes'}</dd></div></dl>
            <div className="my-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Verified security code</p><p className="mt-2 font-mono text-xl font-bold tracking-wider text-white print:text-black">{payment.receipt_security_code}</p><p className="mt-2 text-xs text-zinc-500">Open the verification link to confirm this receipt against the live database.</p></div>
            <ReceiptActions amount={amount} memberName={member.full_name} paymentId={payment.id} receiptNo={number} securityCode={payment.receipt_security_code} />
          </div>
        </article>
      </div>
    </main>
  );
}
