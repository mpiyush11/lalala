'use client';

import { useState, type FormEvent } from 'react';

import { AlertTriangle, CheckCircle2, Clock, Lock, Search } from 'lucide-react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/client';
import type { ReceiptAuthenticity } from '@/lib/types/database';

function formatStamp(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    timeZone,
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Counterfeit receipt scanner.
 *
 * Resolution happens entirely inside `verify_receipt_authenticity`, which is
 * tenant-scoped server-side. A "no match" result is presented as an explicit
 * fraud warning rather than an empty state, because for this workflow the
 * absence of a record IS the finding.
 */
export function ReceiptChecker({ timeZone }: { timeZone: string }) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<ReceiptAuthenticity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (isSearching || trimmed.length < 4) return;

    setIsSearching(true);
    setError(null);
    setResult(null);
    setNotFound(false);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc('verify_receipt_authenticity', {
        p_query: trimmed,
      });

      if (rpcError) {
        setError(rpcError.message);
        setIsSearching(false);
        return;
      }

      const rows = (data ?? []) as ReceiptAuthenticity[];
      if (!rows.length) setNotFound(true);
      else setResult(rows[0]);

      setIsSearching(false);
    } catch {
      setError('Could not reach the server. Please try again.');
      setIsSearching(false);
    }
  }

  return (
    <>
      <form onSubmit={search} className="rounded-2xl border border-border/70 bg-surface p-4 shadow-lg shadow-black/20">
        <label htmlFor="receipt-query" className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">
            {copy.pages.verifyBill.inputLabel}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="receipt-query"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="RCT-91000000... or SEC-414C-29FE"
              data-testid="receipt-query"
              className="h-12 min-h-[44px] w-full rounded-xl border border-border/70 bg-surface-elevated px-4 font-mono text-base text-white outline-none transition placeholder-slate-500 focus:border-accent"
            />
            <button
              type="submit"
              disabled={isSearching || query.trim().length < 4}
              data-testid="verify-btn"
              className="inline-flex h-12 min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-6 text-sm font-semibold text-accent transition hover:bg-accent/25 active:scale-[0.98] disabled:opacity-40"
            >
              {isSearching ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-border/70 border-t-accent" />
                  Checking…
                </>
              ) : (
                <>
                  <Search aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                  Verify
                </>
              )}
            </button>
          </div>
          <span className="mt-1.5 block text-xs text-slate-500">
            {copy.pages.verifyBill.inputHint}
          </span>
        </label>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {notFound ? (
        <div
          role="alert"
          data-testid="fraud-alert"
          className="mt-4 rounded-xl border-2 border-rose-500/40 bg-rose-500/10 p-5"
        >
          <p className="flex items-center gap-2 text-base font-bold text-rose-300">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
            INVALID OR TAMPERED RECEIPT
          </p>
          <p className="mt-2 text-sm leading-6 text-rose-100/90">
            {copy.pages.verifyBill.notFound}
          </p>
        </div>
      ) : null}

      {result ? (
        <article
          data-testid="verified-dossier"
          className="mt-4 overflow-hidden rounded-2xl border-2 border-emerald-600/40 bg-surface shadow-lg shadow-black/20"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-transparent px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-400">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
              AUTHENTIC RECEIPT VERIFIED
            </p>
            <span className="font-mono text-xs text-slate-400">{result.receipt_number}</span>
          </header>

          <div className="p-5">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">{copy.pages.verifyBill.amountReceived}</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">
                {formatMoney(result.amount_minor, result.currency)}
              </p>
              {result.tender_mode === 'SPLIT' ? (
                <p data-testid="tender-breakdown" className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">SPLIT</span>
                  <span className="rounded-full bg-transparent px-2.5 py-1 text-emerald-500">
                    {formatMoney(result.cash_minor)} Cash
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="rounded-full bg-surface-elevated px-2.5 py-1 text-slate-300">
                    {formatMoney(result.upi_minor)} UPI
                  </span>
                </p>
              ) : (
                <p data-testid="tender-breakdown" className="mt-2 text-sm font-bold uppercase text-slate-300">
                  {result.tender_mode}
                </p>
              )}
            </div>

            <dl className="mt-5 space-y-2.5 border-t border-border/70 pt-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Member</dt>
                <dd className="text-right font-semibold text-white" data-testid="dossier-member">
                  {result.member_name}
                  <span className="ml-2 font-mono text-xs text-slate-500">{result.member_code}</span>
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">{copy.pages.verifyBill.issuedBy}</dt>
                <dd data-testid="dossier-staff" className="text-right font-semibold text-white">
                  {result.issued_by}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">{copy.pages.verifyBill.issuedAt}</dt>
                <dd className="text-right font-mono text-xs text-slate-300">
                  {formatStamp(result.paid_at ?? result.created_at, timeZone)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">{copy.pages.verifyBill.securityCode}</dt>
                <dd className="text-right font-mono font-bold text-emerald-500">
                  {result.security_code}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
                <dt className="text-slate-500">{copy.pages.verifyBill.shiftStatus}</dt>
                <dd>
                  {result.is_locked ? (
                    <span
                      data-testid="shift-lock-badge"
                      className="rounded-full bg-transparent px-3 py-1 text-xs font-bold text-emerald-500"
                    >
                      <Lock aria-hidden="true" className="mr-1 inline h-3 w-3" strokeWidth={2} />
                Sealed in Shift #{result.payment_id.slice(0, 8)}
                    </span>
                  ) : (
                    <span
                      data-testid="shift-lock-badge"
                      className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300"
                    >
                      <Clock aria-hidden="true" className="mr-1 inline h-3 w-3" strokeWidth={2} />
                Pending Shift Audit
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      ) : null}
    </>
  );
}
