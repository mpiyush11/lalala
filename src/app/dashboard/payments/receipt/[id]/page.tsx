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
    <main className="min-h-screen bg-canvas px-4 py-8 text-slate-100 print:bg-white print:text-black">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard/payments" className="mb-5 inline-flex text-sm font-semibold text-accent print:hidden">← Payment records</Link>
        <article className="overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-black/20 print:border-slate-300 print:bg-white print:shadow-none">
          <header className="border-b border-border bg-surface-elevated/50 p-6 text-center print:bg-white"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Digital payment receipt</p><h1 className="mt-3 text-2xl font-bold text-white print:text-black">{tenant.name}</h1><p className="mt-2 font-mono text-sm text-slate-400">{number}</p></header>
          <div className="p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Member</p><p className="mt-1 font-semibold text-white print:text-black">{member.full_name}</p><p className="text-xs text-slate-500">{member.member_code} · {member.phone_number}</p></div><div className="sm:text-right"><p className="text-xs text-slate-500">Paid at</p><p className="mt-1 font-semibold text-white print:text-black">{payment.paid_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone }).format(new Date(payment.paid_at)) : '—'}</p></div></div>
            <div className="my-7 rounded-2xl border border-accent/20 bg-accent/5 p-6 text-center"><p className="text-xs uppercase tracking-wider text-slate-500">Amount received</p><p className="mt-2 text-4xl font-bold text-white print:text-black">{amount}</p>{isSplit ? (
              <div className="mt-3">
                <span data-testid="tender-badge" className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Split
                </span>
                <p data-testid="tender-breakdown" className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-success">{formatMoney(payment.cash_minor, payment.currency)} Cash</span>
                  <span className="text-slate-500">•</span>
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-accent">{formatMoney(payment.upi_minor, payment.currency)} UPI</span>
                </p>
              </div>
            ) : (
              <p data-testid="tender-badge" className="mt-2 text-sm font-semibold uppercase text-accent">{payment.method}</p>
            )}</div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl bg-canvas/50 p-4 print:bg-slate-50"><dt className="text-xs text-slate-500">Next expiry date</dt><dd className="mt-1 font-semibold text-white print:text-black">{formatDateKey(member.membership_expires_on)}</dd></div><div className="rounded-xl bg-canvas/50 p-4 print:bg-slate-50"><dt className="text-xs text-slate-500">Notes</dt><dd className="mt-1 font-semibold text-white print:text-black">{payment.notes ?? 'No notes'}</dd></div></dl>
            <div className="my-6 rounded-xl border border-success/30 bg-success/10 p-4 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-success">Cryptographically secured</p><p className="mt-2 font-mono text-xl font-bold tracking-wider text-white print:text-black">{payment.receipt_security_code}</p><p className="mt-2 text-xs text-slate-500">Open the verification link to confirm this receipt against the live database.</p></div>
            <ReceiptActions amount={amount} memberName={member.full_name} paymentId={payment.id} receiptNo={number} securityCode={payment.receipt_security_code} />
          </div>
        </article>
      </div>
    </main>
  );
}
