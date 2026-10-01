import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { ownerCopy as copy } from '@/lib/copy/owner';
import { formatMoney } from '@/lib/format/currency';
import { createClient } from '@/lib/supabase/server';

import { StaffDirectory, type StaffRow } from './staff-directory';

export const metadata: Metadata = { title: 'Staff & Shifts' };
export const dynamic = 'force-dynamic';

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Who is on the floor, and who can log in.
 *
 * The shift card answers "who is holding my cash right now"; the directory
 * answers "who still has a key". Both are read-only apart from provisioning,
 * which is the one staffing action an owner takes often enough for a button.
 */
export default async function OwnerStaffPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('tenant_id', currentUser.tenantId)
    .single();

  const timeZone = tenant?.timezone ?? 'Asia/Kolkata';

  const [staffResult, shiftResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, role, phone_number, is_active')
      .eq('tenant_id', currentUser.tenantId)
      .order('role')
      .order('full_name'),
    supabase
      .from('shifts')
      // `petty_expenses_minor` is an existing column, added to the select so the
      // card can show money out beside money in. No schema or RPC change.
      .select('staff_id, opened_at, system_cash_in_minor, petty_expenses_minor')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const staff: StaffRow[] = (staffResult.data ?? []).map((person) => ({
    fullName: person.full_name,
    id: person.id,
    isActive: person.is_active,
    phoneNumber: person.phone_number,
    role: person.role,
  }));

  const openShift = shiftResult.data;
  const onDeskName = openShift
    ? (staff.find((person) => person.id === openShift.staff_id)?.fullName ?? 'Unknown staff')
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <h1 className="text-lg font-semibold text-white">{copy.nav.sections.staff}</h1>

      <section
        data-testid="active-shift-banner"
        data-shift-state={openShift ? 'open' : 'dormant'}
        className={`rounded-xl border p-4 sm:p-5 ${
          openShift
            ? // A live desk session is the one thing on this screen that is
              // happening right now; an emerald wash plus a matching border
              // separates it from the inert directory below at a glance.
              'border-emerald-500/25 bg-emerald-950/10'
            : 'border-border/70 bg-surface'
        }`}
      >
        {openShift && onDeskName ? (
          <>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {/* A pulse, not a static dot: the point is that this is happening
                  right now, and a still dot reads as a colour swatch. */}
              <span
                aria-hidden="true"
                data-testid="shift-pulse"
                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
              />
              {copy.staff.activeShift}
            </p>

            <p className="mt-2 truncate text-base font-semibold text-white sm:text-lg">
              {onDeskName}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {copy.staff.since(timeOf(openShift.opened_at, timeZone))}
            </p>

            {/* Money in and money out, side by side — the two halves of the
                drawer an owner reconciles at handover. */}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
              <div className="min-w-0">
                <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {copy.staff.cashInShift}
                </dt>
                <dd
                  data-testid="shift-cash"
                  className="mt-1 truncate text-base font-bold tabular-nums text-emerald-400 sm:text-lg"
                >
                  +{formatMoney(openShift.system_cash_in_minor)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {copy.staff.expensesInShift}
                </dt>
                <dd
                  data-testid="shift-expenses"
                  className="mt-1 truncate text-base font-bold tabular-nums text-slate-300 sm:text-lg"
                >
                  −{formatMoney(openShift.petty_expenses_minor)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <div data-testid="no-shift" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-slate-600"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-300">
                {copy.staff.noShiftTitle}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{copy.staff.noShift}</p>
            </div>
          </div>
        )}
      </section>

      <StaffDirectory staff={staff} />
    </div>
  );
}
