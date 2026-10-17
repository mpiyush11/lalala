import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { OwnerBottomNav, OwnerBottomNavSpacer, OwnerMobileHeader } from '@/components/owner-bottom-nav';
import { OwnerSidebar } from '@/components/owner-sidebar';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Owner Cockpit shell.
 *
 * Desktop (>= 1024px) gets a persistent left sidebar and the content column is
 * inset by its width. Phones get a sticky header plus a four-tab bottom bar.
 *
 * Defence in depth: middleware already blocks `/owner/*` for non-owners, but
 * the guard is repeated here so a direct render can never leak drawer figures
 * and staff attribution. RLS remains the final boundary on the data itself.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  if (currentUser.role !== 'owner' && currentUser.role !== 'superadmin') {
    redirect('/dashboard?auth_error=forbidden&status=403');
  }

  const supabase = await createClient();
  const [tenantResult, shiftResult] = await Promise.all([
    supabase.from('tenants').select('name').eq('tenant_id', currentUser.tenantId).single(),
    supabase
      .from('shifts')
      .select('staff_id')
      .eq('tenant_id', currentUser.tenantId)
      .eq('status', 'OPEN')
      .limit(1)
      .maybeSingle(),
  ]);

  const gymName = tenantResult.data?.name ?? 'GymOS';

  let onDeskStaffName: string | null = null;
  if (shiftResult.data?.staff_id) {
    const { data: staff } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', shiftResult.data.staff_id)
      .single();
    onDeskStaffName = staff?.full_name ?? null;
  }

  // `bg-canvas` (#121212) is the exact token the front desk shell uses, so the
  // two panels share one background. Cards then sit at `bg-surface` (#1E1E2E),
  // a step ABOVE the shell, behind a `#3C494C` hairline — the same relationship
  // the reception dashboard uses. The previous inverted scheme (a near-black
  // translucent card on a #121212 shell) put card and shell a few luminance
  // points apart, which is what read as muddy.
  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <OwnerSidebar
        gymName={gymName}
        onDeskStaffName={onDeskStaffName}
        ownerName={currentUser.profile.full_name}
      />

      <div className="lg:pl-[68px] xl:pl-[232px]">
        <OwnerMobileHeader
          gymName={gymName}
          onDeskStaffName={onDeskStaffName}
          ownerName={currentUser.profile.full_name}
        />
        {/* Reading container, byte-identical to the reception dashboard's
            `mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8`, so both panels share
            one measure. The owner sidebar (`xl:pl-[232px]`) already insets this
            column, so the effective content width at 1280px stays ~1048px —
            inside the one-eye-scan budget the old max-w-5xl bought. */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <OwnerBottomNavSpacer />
      </div>

      <OwnerBottomNav />
    </div>
  );
}
