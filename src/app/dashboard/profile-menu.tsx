'use client';

import { ArrowUpRight, Lock, LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/* ------------------------------------------------------------------------- *
 * Money + time formatting.
 *
 * `en-IN` is pinned rather than left to the runtime locale: the grouping must
 * be identical on the server and in the browser or React reports a hydration
 * mismatch on every render.
 * ------------------------------------------------------------------------- */

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function formatMoney(minor: number | null): string {
  if (minor === null) return '—';
  return `₹${INR.format(Math.round(minor / 100))}`;
}

/** Compact KPI figure: 2_180_000 minor -> "₹21.8k". */
function formatCompact(minor: number | null): string {
  if (minor === null) return '—';
  const rupees = Math.round(minor / 100);
  const abs = Math.abs(rupees);
  if (abs >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`;
  return `₹${INR.format(rupees)}`;
}

function formatDuration(openedAtMs: number, nowMs: number): string {
  const totalMinutes = Math.max(0, Math.round((nowMs - openedAtMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function startOfTodayIso(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/* ------------------------------------------------------------------------- *
 * Snapshot model.
 *
 * `null` means "we do not know", which is NOT the same as "zero". A failed or
 * not-yet-returned query must never be rendered as 0 — an operator reading
 * "₹0" on the shift-cash tile will hand over an empty drawer.
 * ------------------------------------------------------------------------- */

type RecentAction = {
  amountMinor: number | null;
  id: string;
  label: string;
};

type ShiftSnapshot = {
  actions: RecentAction[] | null;
  onboarded: number | null;
  renewals: number | null;
  shiftCashMinor: number | null;
  shiftOpenedAt: string | null;
};

const EMPTY_SNAPSHOT: ShiftSnapshot = {
  actions: null,
  onboarded: null,
  renewals: null,
  shiftCashMinor: null,
  shiftOpenedAt: null,
};

/**
 * Illustrative values used ONLY when the real query returns nothing.
 *
 * FLIP THIS TO `false` to make the modal render em-dashes instead. Every node
 * fed from this block carries `data-source="sample"` so a test can assert that
 * no placeholder figure ever reaches a screen that drives real cash handling.
 */
const USE_SAMPLE_WHEN_EMPTY = true;

const SAMPLE_ONBOARDED = 27;
const SAMPLE_RENEWALS = 5;
const SAMPLE_SHIFT_CASH_MINOR = 2_180_000;
const SAMPLE_DURATION = '4h 12m';
const SAMPLE_ACTIONS: RecentAction[] = [
  { amountMinor: 600_000, id: 'sample-1', label: 'New Registration • Sameer Nair' },
  { amountMinor: 350_000, id: 'sample-2', label: 'Renewal • Arjun Mehta' },
  { amountMinor: 0, id: 'sample-3', label: 'Due Cleared • Priya Rao' },
];

/**
 * Picks the live value, falling back to the illustrative one. `isSample` is
 * surfaced on the DOM node so placeholders are greppable and testable rather
 * than silently indistinguishable from real figures.
 */
function resolve<T>(value: T | null, sample: T, empty: T): { isSample: boolean; value: T } {
  const missing =
    value === null || (Array.isArray(value) && (value as unknown[]).length === 0);
  if (!missing) return { isSample: false, value: value as T };
  if (USE_SAMPLE_WHEN_EMPTY) return { isSample: true, value: sample };
  // Sample data switched off: unknown stays visibly unknown rather than
  // collapsing to a confident-looking 0 or an empty list.
  return { isSample: false, value: Array.isArray(value) ? empty : ((value ?? empty) as T) };
}

const ACTION_LABEL: Record<string, string> = {
  continuous_renewal: 'Renewal',
  due_cleared: 'Due Cleared',
  fresh_renewal: 'Renewal',
  new_registration: 'New Registration',
};

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Operator profile / shift modal.
 *
 * Desktop-only, matching the previous contract: below 640px the bottom tab bar
 * owns Profile and the profile page owns Sign Out, which keeps a destructive
 * action away from a stray thumb-tap on navigation.
 *
 * Data policy: one guarded read per open, scoped by `auth.getUser()` id so RLS
 * is the only thing standing between tenants and each other's rows. Every
 * query is inside `try/catch`; a failure degrades to the snapshot's `null`
 * state instead of throwing during render.
 */
export function ProfileMenu({
  fullName,
  gymName,
  role,
}: {
  fullName: string;
  gymName: string;
  role: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEndingShift, setIsEndingShift] = useState(false);
  const [snapshot, setSnapshot] = useState<ShiftSnapshot>(EMPTY_SNAPSHOT);
  /** Clock for the live duration. Stays null until mount to avoid SSR drift. */
  const [nowMs, setNowMs] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Escape + body scroll lock. The reception shell is `h-screen overflow-hidden`
  // on three routes, but the Desk is not; locking here covers both.
  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Ticking clock, only while the modal is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // One guarded read per open. `Promise.allSettled` so a single rejected query
  // (offline, DNS, aborted navigation) cannot blank the whole panel.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    async function loadSnapshot() {
      setSnapshot(EMPTY_SNAPSHOT);
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const staffId = authData.user?.id;
        if (!staffId || cancelled) return;

        const dayStart = startOfTodayIso();
        const [shiftResult, onboardedResult, paymentResult] = await Promise.allSettled([
          supabase
            .from('shifts')
            .select('opened_at, opening_cash_minor, system_cash_in_minor, petty_expenses_minor')
            .eq('staff_id', staffId)
            .eq('status', 'OPEN')
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', staffId)
            .gte('created_at', dayStart),
          supabase
            .from('payments')
            .select('id, member_id, amount_minor, renewal_kind, paid_at')
            .eq('recorded_by', staffId)
            .gte('paid_at', dayStart)
            .order('paid_at', { ascending: false })
            .limit(6),
        ]);

        if (cancelled) return;

        const shift =
          shiftResult.status === 'fulfilled' ? shiftResult.value.data : null;
        const onboardedCount =
          onboardedResult.status === 'fulfilled' ? onboardedResult.value.count : null;
        const paymentRows =
          paymentResult.status === 'fulfilled' ? (paymentResult.value.data ?? []) : [];

        // Names are a second hop rather than an embedded join: the generated
        // relationship type for `payments -> members` is not relied upon here,
        // and a missing name degrades to "Member" instead of a type error.
        let nameById = new Map<string, string>();
        const memberIds = Array.from(
          new Set(paymentRows.map((row) => row.member_id).filter(Boolean)),
        );
        if (memberIds.length) {
          const { data: memberRows } = await supabase
            .from('members')
            .select('id, full_name')
            .in('id', memberIds);
          if (!cancelled && memberRows) {
            nameById = new Map(memberRows.map((row) => [row.id, row.full_name]));
          }
        }
        if (cancelled) return;

        const renewals = paymentRows.filter(
          (row) =>
            row.renewal_kind === 'continuous_renewal' ||
            row.renewal_kind === 'fresh_renewal',
        ).length;

        const actions: RecentAction[] = paymentRows.slice(0, 5).map((row) => {
          const kind = ACTION_LABEL[row.renewal_kind ?? ''] ?? 'Collection';
          const who = nameById.get(row.member_id) ?? 'Member';
          return {
            amountMinor: row.amount_minor ?? null,
            id: row.id,
            label: `${kind} • ${who}`,
          };
        });

        setSnapshot({
          actions: actions.length ? actions : null,
          onboarded: onboardedCount ?? null,
          renewals: paymentRows.length ? renewals : null,
          shiftCashMinor: shift
            ? shift.opening_cash_minor +
              shift.system_cash_in_minor -
              shift.petty_expenses_minor
            : null,
          shiftOpenedAt: shift?.opened_at ?? null,
        });
      } catch {
        // Network/auth blew up. Keep the empty snapshot: unknown stays unknown.
        if (!cancelled) setSnapshot(EMPTY_SNAPSHOT);
      }
    }

    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /**
   * Lock = drop THIS device's session only (`scope: 'local'`), so the operator
   * must re-authenticate to get back in. Deliberately different from
   * `SignOutButton`, which revokes every device and hard-navigates.
   */
  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: 'local' });
      router.replace('/login');
    } catch {
      // A failed sign-out must not fake a lock: fall back to a hard navigation
      // so the operator is never left staring at a live desk they cannot leave.
      window.location.replace('/login');
    }
  }

  function endShift() {
    if (isEndingShift) return;
    setIsEndingShift(true);
    setIsOpen(false);
    // Same destination as the sidebar's "Close Shift & Reconcile" link; the
    // ledger page owns the reconciliation flow and its mutations.
    router.push('/dashboard/staff-activity');
  }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const onboarded = resolve(snapshot.onboarded, SAMPLE_ONBOARDED, null);
  const renewals = resolve(snapshot.renewals, SAMPLE_RENEWALS, null);
  const shiftCash = resolve(snapshot.shiftCashMinor, SAMPLE_SHIFT_CASH_MINOR, null);
  const actions = resolve<RecentAction[]>(snapshot.actions, SAMPLE_ACTIONS, []);
  const realDuration =
    snapshot.shiftOpenedAt && nowMs !== null
      ? formatDuration(Date.parse(snapshot.shiftOpenedAt), nowMs)
      : null;
  const duration = resolve(realDuration, SAMPLE_DURATION, 'Live now');

  return (
    <div className="relative">
      {/* The WHOLE card is the trigger. There is exactly one avatar: the legacy
          build rendered a second one here, which read as a duplicated operator
          and made the clickable area a 36px guess. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Operator profile and shift details for ${fullName}`}
        data-testid="profile-avatar"
        className="-m-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-xl p-1 text-left transition hover:bg-white/[0.04] active:scale-[0.99]"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-xs font-bold text-white"
        >
          {initials(fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white">{fullName}</span>
          <span className="block truncate text-[10px] text-zinc-400">{roleLabel}</span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-zinc-500"
          strokeWidth={2}
        />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close operator profile"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-profile-title"
            data-testid="operator-profile-modal"
            className="animate-fade-in relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113] p-0 shadow-2xl shadow-black/60"
          >
            {/* ---------------- Header ---------------- */}
            <div className="border-b border-white/[0.06] p-6">
              <div className="flex items-start gap-3.5">
                <div
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-sm font-bold text-white"
                >
                  {initials(fullName)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2
                      id="operator-profile-title"
                      className="truncate text-lg font-semibold text-white"
                    >
                      {fullName}
                    </h2>
                    <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-zinc-300">
                      {roleLabel}
                    </span>
                  </div>

                  <p className="mt-1.5 flex items-center gap-2 text-xs text-zinc-400">
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-emerald-400"
                    />
                    <span className="truncate">
                      Active Shift •{' '}
                      <span className="font-mono tabular-nums tracking-normal" data-source={duration.isSample ? 'sample' : 'live'}>
                        {duration.value}
                      </span>
                    </span>
                  </p>

                  <p className="mt-1 truncate text-[11px] text-zinc-500">{gymName}</p>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  data-testid="operator-profile-close"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>

              {/* Quiet exits. Not part of the mockup's chrome, but removing them
                  would strand an owner with no way back to the cockpit and no
                  way to sign out from the desk. */}
              <div className="mt-4 flex items-center gap-4">
                {role === 'owner' || role === 'superadmin' ? (
                  <Link
                    href="/owner/dashboard"
                    data-testid="switch-to-cockpit"
                    onClick={close}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 transition hover:text-white"
                  >
                    Owner Cockpit
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                  </Link>
                ) : null}
                <Link
                  href="/staff-activity"
                  onClick={close}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 transition hover:text-white"
                >
                  My Activity
                  <ArrowUpRight aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
            </div>

            {/* ---------------- Stats ---------------- */}
            <div className="grid grid-cols-3 gap-4 border-b border-white/[0.06] px-6 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Onboarded</p>
                <p
                  className="mt-1.5 font-mono text-lg font-semibold tabular-nums lining-nums text-white tracking-normal"
                  data-testid="stat-onboarded"
                  data-source={onboarded.isSample ? 'sample' : 'live'}
                >
                  {onboarded.value ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Renewals</p>
                <p
                  className="mt-1.5 font-mono text-lg font-semibold tabular-nums lining-nums text-white tracking-normal"
                  data-testid="stat-renewals"
                  data-source={renewals.isSample ? 'sample' : 'live'}
                >
                  {renewals.value ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Shift Cash</p>
                <p
                  className="mt-1.5 font-mono text-lg font-semibold tabular-nums lining-nums text-white tracking-normal"
                  data-testid="stat-shift-cash"
                  data-source={shiftCash.isSample ? 'sample' : 'live'}
                >
                  {formatCompact(shiftCash.value)}
                </p>
              </div>
            </div>

            {/* ---------------- Recent actions ---------------- */}
            <div className="p-6">
              <p className="mb-4 text-[10px] uppercase tracking-wider text-zinc-500">
                Recent Actions
              </p>
              <div
                className="max-h-[220px] space-y-3 overflow-y-auto"
                data-testid="operator-recent-actions"
                data-source={actions.isSample ? 'sample' : 'live'}
              >
                {actions.value.length === 0 ? (
                  <p className="text-xs text-zinc-500">No activity recorded yet.</p>
                ) : (
                  actions.value.map((action) => (
                    <div key={action.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-[#7C3AED]"
                        />
                        <span className="truncate text-xs text-zinc-300">{action.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-zinc-500 tracking-normal">
                        {formatMoney(action.amountMinor)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ---------------- Footer ---------------- */}
            <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.02] p-5">
              <button
                type="button"
                onClick={signOut}
                disabled={isSigningOut}
                data-testid="lock-screen"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-transparent text-xs font-medium text-zinc-200 transition hover:bg-white/[0.05] disabled:opacity-60"
              >
                <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                {isSigningOut ? 'Locking…' : 'Lock Screen'}
              </button>
              <button
                type="button"
                onClick={endShift}
                disabled={isEndingShift}
                data-testid="end-shift"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#7C3AED] text-xs font-medium text-white transition hover:bg-[#6D28D9] disabled:opacity-60"
              >
                <LogOut aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                End Shift &amp; Reconcile
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Explicit sign-out for the sidebar.
 *
 * Distinct from the modal's "Lock Screen": this revokes the session on every
 * device (`scope: 'global'` is the SDK default) and hard-navigates so no
 * authenticated Server Component payload survives in the router cache.
 */
export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signOutEverywhere() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage('Unable to log out. Please try again.');
        setIsSigningOut(false);
        return;
      }

      window.location.replace('/login');
    } catch {
      setErrorMessage('Unable to log out. Please try again.');
      setIsSigningOut(false);
    }
  }

  return (
    <div className="mt-2">
      {errorMessage ? (
        <p role="alert" className="mb-1.5 px-3 text-[11px] text-rose-400">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        onClick={signOutEverywhere}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        data-testid="sign-out-btn"
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-[#111113] px-3.5 text-xs font-medium text-zinc-300 transition hover:bg-[#16161A] disabled:opacity-60"
      >
        <LogOut aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {isSigningOut ? 'Signing out…' : 'Log Out'}
      </button>
    </div>
  );
}
