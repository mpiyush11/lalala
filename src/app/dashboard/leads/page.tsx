import type { Metadata } from 'next';
import { LayoutGrid, Sparkles, UserPlus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { NotificationBell } from '../notification-bell';
import { MobileBottomNav, MobileBottomNavSpacer } from '../mobile-bottom-nav';
import { ProfileMenu, SignOutButton } from '../profile-menu';
import { LeadsTable, type PipelineLead } from './leads-table';

export const metadata: Metadata = { title: 'Leads Pipeline' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');

  const supabase = await createClient();
  const [tenantResult, leadsResult] = await Promise.all([
    supabase
      .from('tenants')
      .select('name, timezone')
      .eq('tenant_id', currentUser.tenantId)
      .single(),
    supabase
      .from('leads')
      .select('id, full_name, phone_number, source, goal, request, status, created_at')
      .eq('tenant_id', currentUser.tenantId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (tenantResult.error || !tenantResult.data || leadsResult.error) {
    throw new Error('Unable to load leads.');
  }

  const leads: PipelineLead[] = (leadsResult.data ?? []).map((lead) => ({
    createdAt: lead.created_at,
    fullName: lead.full_name,
    goal: lead.goal,
    id: lead.id,
    interest: lead.request,
    phoneNumber: lead.phone_number,
    source: lead.source,
    status: lead.status,
  }));

  const leadCount = leads.filter((lead) => lead.status !== 'converted').length;

  return (
    // SCROLL LOCK: the shell is exactly viewport height and never scrolls. Only
    // the table body scrolls, so the page can never produce a second scrollbar.
    <div className="flex h-screen overflow-hidden bg-[#09090B] text-zinc-100">
      {/* ================= Sidebar rail (lg+) ================= */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0C0C0E] lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.08] px-5">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] shadow-[0_0_15px_rgba(124,92,246,0.5)]">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">Kinetiq</p>
            <p className="truncate text-[11px] text-zinc-400">Reception Terminal</p>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-500">
            Workspace
          </p>
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Desk
          </Link>
          <Link
            href="/dashboard/members"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Users aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Members
          </Link>
          <Link
            href="/dashboard/leads"
            aria-current="page"
            data-testid="leads-badge"
            className="flex items-center gap-2.5 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-2 text-sm font-medium text-white"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">Leads</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono font-medium tabular-nums text-zinc-400 tracking-normal">
              {leadCount}
            </span>
          </Link>
          <Link
            href="/dashboard/payments"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Wallet aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Ledger
          </Link>
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111113] p-3">
            {/* ONE avatar. The old build rendered a monogram here and a second
                one inside the profile trigger, so the rail showed two faces for
                one operator. The whole card is the modal trigger. */}
            <ProfileMenu
              fullName={currentUser.profile.full_name}
              gymName={tenantResult.data.name}
              role={currentUser.role}
            />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
              Shift live
            </div>
          </div>
          {/* "Close Shift & Reconcile" was a link to a page that cannot close a
              shift. The shift flow lives in the profile modal's footer; this
              rail's job is to let the operator out. */}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ================= Top bar: title + bell only ================= */}
        <header className="shrink-0 border-b border-white/[0.08]">
          <div className="mx-auto flex w-full max-w-[1400px] min-h-[76px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[76px] lg:flex-nowrap lg:py-0">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                Leads Pipeline
              </h1>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate">{leadCount} open enquiries · Shift live</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* min-h-0 lets the inner scroller own the overflow instead of the page. */}
        <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <LeadsTable leads={leads} timezone={tenantResult.data.timezone} />
        </main>

        <MobileBottomNavSpacer />
        <MobileBottomNav />
      </div>
    </div>
  );
}

