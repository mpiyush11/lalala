'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

export type StaffRow = {
  fullName: string;
  id: string;
  isActive: boolean;
  phoneNumber: string | null;
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  receptionist: 'Receptionist',
  superadmin: 'Superadmin',
  trainer: 'Trainer',
};

/**
 * Staff directory plus provisioning.
 *
 * Account creation goes through `create_staff_member`, which re-asserts owner
 * role and tenant from the JWT and hashes the passcode server-side — the
 * browser never touches auth.users directly.
 */
export function StaffDirectory({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'receptionist' | 'trainer'>('receptionist');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdding) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsAdding(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isAdding]);

  function reset() {
    setName('');
    setPhone('');
    setRole('receptionist');
    setPasscode('');
    setError(null);
  }

  const canSubmit =
    name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10 && passcode.length >= 8;

  async function createStaff() {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('create_staff_member', {
        p_name: name.trim(),
        p_passcode: passcode,
        p_phone: phone,
        p_role: role,
      });

      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        return;
      }

      setBusy(false);
      setIsAdding(false);
      reset();
      router.refresh();
    } catch {
      setError(copy.common.networkError);
      setBusy(false);
    }
  }

  const field =
    'h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-600';

  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {copy.staff.directory}
        </h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setIsAdding(true);
          }}
          data-testid="add-staff-btn"
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-zinc-700 px-3 text-xs text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          {copy.staff.addStaff}
        </button>
      </div>

      <ul data-testid="staff-list">
        {staff.map((person) => (
          <li
            key={person.id}
            data-testid="staff-row"
            className="flex h-[50px] min-w-0 items-center gap-3 border-b border-zinc-800/60"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="text-[15px] font-semibold text-zinc-100">{person.fullName}</span>
              <span className="ml-2 text-xs text-zinc-500">
                {ROLE_LABEL[person.role] ?? person.role}
              </span>
            </span>
            <span className="hidden shrink-0 font-mono text-xs text-zinc-500 sm:inline">
              {person.phoneNumber ?? '—'}
            </span>
            <span
              data-testid="staff-status"
              className={`shrink-0 text-xs ${person.isActive ? 'text-emerald-500' : 'text-zinc-600'}`}
            >
              {person.isActive ? copy.staff.statusActive : copy.staff.inactive}
            </span>
          </li>
        ))}
      </ul>

      {isAdding ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label={copy.common.cancel}
            onClick={() => setIsAdding(false)}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-staff-title"
            data-testid="add-staff-dialog"
            className="animate-sheet-up relative w-full rounded-t-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-xl"
          >
            <h3 id="add-staff-title" className="text-base font-semibold text-zinc-100">
              {copy.staff.modalTitle}
            </h3>

            <label htmlFor="staff-name" className="mt-4 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.staff.modalName}</span>
              <input
                id="staff-name"
                type="text"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                data-testid="staff-name"
                className={field}
              />
            </label>

            <label htmlFor="staff-phone" className="mt-3 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.staff.modalPhone}</span>
              <input
                id="staff-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                placeholder="10-digit mobile"
                data-testid="staff-phone"
                className={field}
              />
            </label>

            <div className="mt-3">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.staff.modalRole}</span>
              <div
                role="radiogroup"
                aria-label={copy.staff.modalRole}
                className="flex rounded-lg border border-zinc-800 p-1"
              >
                {(['receptionist', 'trainer'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={role === option}
                    onClick={() => setRole(option)}
                    data-testid={`staff-role-${option}`}
                    className={`h-9 flex-1 rounded-md text-sm capitalize transition ${
                      role === option ? 'bg-zinc-800 font-medium text-zinc-100' : 'text-zinc-500'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label htmlFor="staff-passcode" className="mt-3 block">
              <span className="mb-1.5 block text-sm text-zinc-400">{copy.staff.modalPasscode}</span>
              <input
                id="staff-passcode"
                type="text"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                data-testid="staff-passcode"
                className={field}
              />
              <span className="mt-1 block text-xs text-zinc-500">
                {copy.staff.modalPasscodeHint}
              </span>
            </label>

            {error ? (
              <p role="alert" data-testid="staff-error" className="mt-3 text-xs text-amber-500/90">
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                data-testid="staff-cancel"
                className="h-10 rounded-lg border border-zinc-800 text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                {copy.staff.modalCancel}
              </button>
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={createStaff}
                data-testid="staff-save"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {busy ? copy.staff.modalSaving : copy.staff.modalSave}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
