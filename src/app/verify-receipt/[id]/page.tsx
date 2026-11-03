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
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-zinc-100">
      <article className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#111113] p-6 text-center shadow-2xl shadow-black/30 sm:p-8">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full border text-3xl ${verified ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/40 bg-rose-500/10 text-rose-400'}`}>{verified ? '✓' : '!'}</div>
        <p className={`mt-5 text-xs font-bold uppercase tracking-[0.25em] ${verified ? 'text-emerald-400' : 'text-rose-400'}`}>{verified ? 'Live database verified' : 'Receipt not verified'}</p>
        <h1 className="mt-3 text-2xl font-bold text-white">{verified ? data.gym_name : 'Invalid or unavailable receipt'}</h1>
        {verified ? <><p className="mt-2 font-mono text-sm text-zinc-400 tracking-normal">{data.receipt_no}</p><div className="my-6 rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-5"><p className="text-xs text-zinc-500">Amount received</p><p className="mt-2 font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-white">{formatMoney(data.amount_minor, data.currency)}</p><p className="mt-2 text-xs font-semibold uppercase text-[#8B5CF6]">{data.payment_method}</p></div><dl className="space-y-3 text-left text-sm"><div className="flex justify-between gap-4 border-b border-white/[0.08] pb-3"><dt className="text-zinc-500">Member</dt><dd className="text-right font-semibold text-white">{data.member_name}<br/><span className="text-xs text-zinc-500">{data.member_code}</span></dd></div><div className="flex justify-between gap-4 border-b border-white/[0.08] pb-3"><dt className="text-zinc-500">Paid at</dt><dd className="text-right text-white">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.paid_at))}</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-500">Security hash</dt><dd className="font-mono font-bold text-emerald-400 tracking-normal">{data.security_code}</dd></div></dl><p className="mt-6 text-xs leading-5 text-zinc-500">This information was read directly from GymOS. Compare the amount, member, and security code with the shared receipt.</p></> : <p className="mt-4 text-sm leading-6 text-zinc-400">No matching paid transaction with a valid cryptographic hash was found. Do not trust an edited screenshot or unsupported payment claim.</p>}
      </article>
    </main>
  );
}
