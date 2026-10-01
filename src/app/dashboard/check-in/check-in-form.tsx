'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

type SelectableMember = {
  full_name: string;
  id: string;
  member_code: string;
  phone_number: string;
};

export function CheckInForm({
  members,
  tenantId,
}: {
  members: SelectableMember[];
  tenantId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [preventDuplicate, setPreventDuplicate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'paused'; text: string } | null>(null);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return members.slice(0, 12);

    return members
      .filter((member) =>
        `${member.full_name} ${member.member_code} ${member.phone_number}`
          .toLocaleLowerCase()
          .includes(term),
      )
      .slice(0, 12);
  }, [members, search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMemberId) {
      setMessage({ kind: 'error', text: 'Select an active member first.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('check_in_member', {
        p_member_id: selectedMemberId,
        p_prevent_duplicate_same_day: preventDuplicate,
        p_tenant_id: tenantId,
      });

      if (error) {
        // A paused membership is an actionable desk state, not a generic
        // failure — surface it in amber with a reactivate path.
        const isPaused = /membership paused/i.test(error.message ?? '');

        setMessage({
          kind: isPaused ? 'paused' : 'error',
          text: isPaused
            ? `${error.message} — reactivate to allow entry.`
            : error.code === '23505'
              ? 'This member is already checked in today.'
              : 'Unable to record check-in. Please try again.',
        });
        return;
      }

      const member = members.find((item) => item.id === selectedMemberId);
      setMessage({
        kind: 'success',
        text: `${member?.full_name ?? 'Member'} checked in successfully.`,
      });
      setSelectedMemberId(null);
      setSearch('');
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Unable to record check-in. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/70 bg-surface p-5 shadow-xl shadow-black/10 sm:p-7">
      <label>
        <span className="mb-2 block text-sm font-medium text-slate-200">Search active members</span>
        <div className="relative">
          <svg viewBox="0 0 24 24" className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-12 w-full rounded-xl border border-border bg-canvas/70 pl-12 pr-4 text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10" placeholder="Name, member code, or phone" />
        </div>
      </label>

      <fieldset className="mt-5">
        <legend className="sr-only">Select member</legend>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {filteredMembers.length ? filteredMembers.map((member) => {
            const selected = selectedMemberId === member.id;
            return (
              <label key={member.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${selected ? 'border-accent bg-accent/10' : 'border-border/70 bg-canvas/40 hover:border-border'}`}>
                <input type="radio" name="member" value={member.id} checked={selected} onChange={() => setSelectedMemberId(member.id)} className="sr-only" />
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${selected ? 'bg-accent text-slate-950' : 'bg-surface-elevated text-accent'}`}>{member.full_name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{member.full_name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{member.member_code} · {member.phone_number}</span>
                </span>
                {selected ? <span className="text-xs font-semibold text-accent">Selected</span> : null}
              </label>
            );
          }) : <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-slate-500">No active members match this search.</p>}
        </div>
      </fieldset>

      <label className="mt-5 flex items-start gap-3 rounded-xl border border-border/70 bg-canvas/40 p-4">
        <input type="checkbox" checked={preventDuplicate} onChange={(event) => setPreventDuplicate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
        <span>
          <span className="block text-sm font-medium text-slate-200">Prevent duplicate check-ins today</span>
          <span className="mt-1 block text-xs text-slate-500">Uses the gym timezone and checks all attendance recorded today.</span>
        </span>
      </label>

      {message ? (
        message.kind === 'paused' ? (
          <div
            role="alert"
            data-testid="paused-checkin-notice"
            className="mt-5 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-300"
          >
            <p className="font-semibold">⏸ {message.text}</p>
            <Link
              href="/dashboard/members"
              className="mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-amber-400/40 bg-amber-400/15 px-4 text-xs font-bold text-amber-200 transition active:scale-[0.98]"
            >
              Reactivate Now
            </Link>
          </div>
        ) : (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mt-5 rounded-xl border p-3 text-sm ${message.kind === 'error' ? 'border-danger/30 bg-danger/10 text-red-200' : 'border-success/30 bg-success/10 text-emerald-200'}`}
          >
            {message.text}
          </p>
        )
      ) : null}

      <button type="submit" disabled={isSubmitting || !selectedMemberId} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-slate-950 shadow-cyan-glow transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
        {isSubmitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />Processing…</> : 'Record check-in'}
      </button>
    </form>
  );
}
