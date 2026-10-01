'use client';

import { ChevronRight } from 'lucide-react';
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

/**
 * Role reads as a semantic pill, not raw text.
 *
 * Each role gets one hue so the directory is scannable by colour before it is
 * read: amber marks the account that can change prices, emerald the counter,
 * sky the floor. Every pill shares the same geometry so no role looks louder
 * than its authority warrants.
 */
const ROLE_STYLE: Record<string, { className: string; label: string }> = {
  owner: {
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    label: 'OWNER',
  },
  receptionist: {
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    label: 'RECEPTIONIST',
  },
  superadmin: {
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    label: 'SUPERADMIN',
  },
  trainer: {
    className: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
    label: 'TRAINER',
  },
};

function RolePill({ role }: { role: string }) {
  const style = ROLE_STYLE[role] ?? {
    className: 'border-border/70 text-slate-400',
    label: role.toUpperCase(),
  };

  return (
    <span
      data-testid="role-pill"
      data-role={role}
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}

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
    'h-10 w-full rounded-xl border border-border/70 bg-surface-elevated px-3.5 text-sm text-white outline-none placeholder-slate-500 focus:border-accent';

  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {copy.staff.directory}
        </h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setIsAdding(true);
          }}
          data-testid="add-staff-btn"
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-accent/40 bg-accent/15 px-3.5 text-xs font-medium text-accent transition-all hover:bg-accent/25 active:scale-95"
        >
          <span className="sm:hidden">{copy.staff.addStaffShort}</span>
          <span className="hidden sm:inline">{copy.staff.addStaff}</span>
        </button>
      </div>

      <ul
        data-testid="staff-list"
        className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-lg shadow-black/20"
      >
        {staff.map((person) => (
          <li
            key={person.id}
            data-testid="staff-row"
            className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-elevated/40"
          >
            {/* Identity stacks: name, then the role pill beneath it. Keeping
                them on one line is what forced the role into raw grey text. */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white sm:text-base">
                {person.fullName}
              </p>
              <p className="mt-1 flex items-center gap-2">
                <RolePill role={person.role} />
                <span className="hidden truncate font-mono text-[11px] text-slate-500 sm:inline">
                  {person.phoneNumber ?? '—'}
                </span>
              </p>
            </div>

            <span
              data-testid="staff-status"
              className={`shrink-0 whitespace-nowrap text-xs ${
                person.isActive ? 'text-emerald-400' : 'text-slate-600'
              }`}
            >
              {person.isActive ? copy.staff.statusActive : copy.staff.inactive}
            </span>

            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-slate-600"
              strokeWidth={2}
            />
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
            className="animate-sheet-up relative w-full rounded-t-xl border border-border/70 bg-surface p-5 shadow-2xl sm:max-w-md sm:animate-none sm:rounded-xl"
          >
            <h3 id="add-staff-title" className="text-base font-semibold text-white">
              {copy.staff.modalTitle}
            </h3>

            <label htmlFor="staff-name" className="mt-4 block">
              <span className="mb-1.5 block text-sm text-slate-400">{copy.staff.modalName}</span>
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
              <span className="mb-1.5 block text-sm text-slate-400">{copy.staff.modalPhone}</span>
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
              <span className="mb-1.5 block text-sm text-slate-400">{copy.staff.modalRole}</span>
              <div
                role="radiogroup"
                aria-label={copy.staff.modalRole}
                className="flex rounded-lg border border-border/70 p-1"
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
                      role === option ? 'bg-surface-elevated font-medium text-white' : 'text-slate-500'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label htmlFor="staff-passcode" className="mt-3 block">
              <span className="mb-1.5 block text-sm text-slate-400">{copy.staff.modalPasscode}</span>
              <input
                id="staff-passcode"
                type="text"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                data-testid="staff-passcode"
                className={field}
              />
              <span className="mt-1 block text-xs text-slate-500">
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
                className="h-10 rounded-lg border border-border/70 text-sm text-slate-300 transition hover:text-white"
              >
                {copy.staff.modalCancel}
              </button>
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={createStaff}
                data-testid="staff-save"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:opacity-40"
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
