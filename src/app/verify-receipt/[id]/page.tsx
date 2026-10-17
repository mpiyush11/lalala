import type { Metadata } from 'next';

import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Verify Receipt' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VerifyReceiptPageProps = { params: { id: string } };

export default async function VerifyReceiptPage({ params }: VerifyReceiptPageProps) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_payment_receipt', { p_payment_id: params.id }).maybeSingle();
  const verified = !error && data?.is_verified === true;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-slate-100">
      <article className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 text-center shadow-2xl shadow-black/30 sm:p-8">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full border text-3xl ${verified ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{verified ? '✓' : '!'}</div>
        <p className={`mt-5 text-xs font-bold uppercase tracking-[0.25em] ${verified ? 'text-success' : 'text-danger'}`}>{verified ? 'Live database verified' : 'Receipt not verified'}</p>
        <h1 className="mt-3 text-2xl font-bold text-white">{verified ? data.gym_name : 'Invalid or unavailable receipt'}</h1>
        {verified ? <><p className="mt-2 font-mono text-sm text-slate-400">{data.receipt_no}</p><div className="my-6 rounded-2xl border border-accent/20 bg-accent/5 p-5"><p className="text-xs text-slate-500">Amount received</p><p className="mt-2 text-3xl font-bold text-white">{formatMoney(data.amount_minor, data.currency)}</p><p className="mt-2 text-xs font-semibold uppercase text-accent">{data.payment_method}</p></div><dl className="space-y-3 text-left text-sm"><div className="flex justify-between gap-4 border-b border-border/50 pb-3"><dt className="text-slate-500">Member</dt><dd className="text-right font-semibold text-white">{data.member_name}<br/><span className="text-xs text-slate-500">{data.member_code}</span></dd></div><div className="flex justify-between gap-4 border-b border-border/50 pb-3"><dt className="text-slate-500">Paid at</dt><dd className="text-right text-white">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.paid_at))}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Security hash</dt><dd className="font-mono font-bold text-success">{data.security_code}</dd></div></dl><p className="mt-6 text-xs leading-5 text-slate-500">This information was read directly from GymOS. Compare the amount, member, and security code with the shared receipt.</p></> : <p className="mt-4 text-sm leading-6 text-slate-400">No matching paid transaction with a valid cryptographic hash was found. Do not trust an edited screenshot or unsupported payment claim.</p>}
      </article>
    </main>
  );
}
