'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

/**
 * Tenant identity + receipt preferences.
 *
 * Name/slug/timezone stay read-only: they key tenant isolation and member
 * codes, so changing them here would silently invalidate existing records.
 */
export function TenantSettingsForm({
  initial,
  readOnly,
  tenantId,
}: {
  initial: { address: string; supportPhone: string; upiId: string };
  readOnly: { currency: string; email: string; name: string; slug: string; timezone: string };
  tenantId: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(initial.address);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone);
  const [upiId, setUpiId] = useState(initial.upiId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenants')
        .update({
          address: address.replace(/\s+/g, ' ').trim() || null,
          support_phone: supportPhone.trim() || null,
          upi_id: upiId.trim() || null,
        })
        .eq('tenant_id', tenantId);

      if (error) {
        setMessage({ kind: 'error', text: error.message });
        setBusy(false);
        return;
      }

      setMessage({ kind: 'ok', text: 'Settings saved.' });
      setBusy(false);
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server.' });
      setBusy(false);
    }
  }

  const field =
    'h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-zinc-700';

  return (
    <>
      <dl
        data-testid="tenant-identity"
        className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:grid-cols-2"
      >
        {[
          { label: 'Gym name', value: readOnly.name },
          { label: 'Subdomain', value: readOnly.slug },
          { label: 'Contact email', value: readOnly.email },
          { label: 'Timezone · Currency', value: `${readOnly.timezone} · ${readOnly.currency}` },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-xs text-zinc-500">{row.label}</dt>
            <dd className="mt-0.5 font-semibold text-white">{row.value}</dd>
          </div>
        ))}
      </dl>

      <form onSubmit={save} className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-bold text-white">{copy.pages.settings.receiptPreferences}</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {copy.pages.settings.receiptHint}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-zinc-200">
              {copy.pages.settings.address}
            </span>
            <input
              data-testid="settings-address"
              value={address}
              maxLength={300}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Shop 4, MI Road, Jaipur 302001"
              className={field}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-zinc-200">{copy.pages.settings.supportPhone}</span>
            <input
              data-testid="settings-phone"
              value={supportPhone}
              maxLength={20}
              inputMode="tel"
              onChange={(event) => setSupportPhone(event.target.value)}
              placeholder="+91 98290 12345"
              className={field}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-zinc-200">
              Primary UPI ID
            </span>
            <input
              data-testid="settings-upi"
              value={upiId}
              maxLength={120}
              onChange={(event) => setUpiId(event.target.value)}
              placeholder="ironparadise@upi"
              className={field}
            />
          </label>
        </div>

        {message ? (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mt-3 rounded-lg p-2.5 text-xs font-semibold ${
              message.kind === 'error' ? 'bg-transparent text-zinc-200' : 'bg-transparent text-emerald-500'
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          data-testid="settings-save"
          className="mt-4 inline-flex h-12 min-h-[44px] items-center justify-center rounded-xl bg-zinc-800 px-6 text-sm font-bold text-zinc-950 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}
