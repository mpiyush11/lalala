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
 * The open-shift banner answers "who is holding my cash right now"; the
 * directory answers "who still has a key". Both are read-only apart from
 * provisioning, which is the one staffing action an owner takes often enough
 * to deserve a button.
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
      .select('staff_id, opened_at, system_cash_in_minor')
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
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-zinc-100">{copy.nav.sections.staff}</h1>

      {/* Active shift banner */}
      <section
        data-testid="active-shift-banner"
        className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
      >
        <p className="text-xs text-zinc-500">{copy.staff.activeShift}</p>
        {openShift && onDeskName ? (
          <>
            <p className="mt-1 text-[15px] font-semibold text-zinc-100">
              {onDeskName}{' '}
              <span className="text-xs font-normal text-zinc-500">
                {copy.staff.since(timeOf(openShift.opened_at, timeZone))}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {copy.staff.cashInShift}:{' '}
              <span data-testid="shift-cash" className="font-mono text-zinc-300">
                {formatMoney(openShift.system_cash_in_minor)}
              </span>
            </p>
          </>
        ) : (
          <p data-testid="no-shift" className="mt-1 text-sm text-zinc-500">
            {copy.staff.noShift}
          </p>
        )}
      </section>

      <StaffDirectory staff={staff} />
    </div>
  );
}
