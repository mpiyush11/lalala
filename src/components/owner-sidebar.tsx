'use client';

import {
  BadgeIndianRupee,
  FileCheck,
  Home,
  LogOut,
  Monitor,
  Settings,
  ChevronUp,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

type SidebarItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

/**
 * The four destinations an owner uses every day. Unchanged from the phone tab
 * bar, so muscle memory transfers between devices.
 */
export const OWNER_SECTIONS: SidebarItem[] = [
  { href: '/owner/dashboard', icon: Home, label: copy.nav.sections.home },
  { href: '/owner/dues', icon: BadgeIndianRupee, label: copy.nav.sections.dues },
  { href: '/owner/staff', icon: Users, label: copy.nav.sections.staff },
  { href: '/owner/plans', icon: Tag, label: copy.nav.sections.plans },
];

/**
 * Lower-frequency, but not rare.
 *
 * These were buried in the profile dropdown, which cost two clicks and a guess
 * to reach a tool an owner uses whenever a member disputes a receipt. The
 * desktop sidebar had the vertical room all along — the dropdown was hiding
 * them for no reason.
 */
const OWNER_TOOLS: SidebarItem[] = [
  { href: '/owner/verify-receipt', icon: FileCheck, label: copy.nav.menu.verifyBill },
  { href: '/owner/settings', icon: Settings, label: copy.nav.menu.settings },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="hidden px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500 xl:block">
      {children}
    </p>
  );
}

function NavLink({ isActive, item }: { isActive: boolean; item: SidebarItem }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={isActive ? 'page' : undefined}
      data-testid="sidebar-link"
      className={`relative flex h-10 items-center gap-2.5 rounded-lg border-l-2 px-3 text-sm transition ${
        isActive
          ? 'border-accent bg-surface-elevated font-semibold text-accent'
          : 'border-transparent font-medium text-slate-400 hover:bg-surface-elevated/50 hover:text-slate-200'
      }`}
    >
      {/* Active rail is the 2px left border: it survives daylight glare, which
          a low-contrast fill alone did not. */}
      <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="hidden min-w-0 truncate xl:block">{item.label}</span>
    </Link>
  );
}

/**
 * Persistent desktop sidebar.
 *
 * Full 232px from 1280px up; a 68px icon rail between 1024 and 1279 so the
 * workspace keeps its width on a laptop. Hidden below 1024px, where the bottom
 * tab bar takes over.
 */
export function OwnerSidebar({
  gymName,
  onDeskStaffName,
  ownerName,
}: {
  gymName: string;
  onDeskStaffName: string | null;
  ownerName: string;
}) {
  const pathname = usePathname() ?? '';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.replace('/login');
  }

  return (
    <aside
      data-testid="owner-sidebar"
      aria-label="Owner sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col border-r border-border/70 bg-surface backdrop-blur-xl lg:flex xl:w-[232px]"
    >
      {/* Brand + who is holding the counter.
          Strictly a glance surface: no links, no buttons. `data-testid` exists
          so a regression spec can assert zero interactive children here. */}
      <div
        data-testid="sidebar-brand-block"
        className="border-b border-border/70 px-3 py-4 xl:px-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/70 bg-surface-elevated text-sm font-bold text-slate-200">
            {initials(gymName)}
          </span>
          <p
            data-testid="sidebar-brand"
            className="hidden min-w-0 truncate text-sm font-bold text-white xl:block"
          >
            {gymName}
          </p>
        </div>
        <p
          data-testid="sidebar-desk-status"
          className="mt-2 hidden items-center gap-1.5 truncate text-[11px] font-medium xl:flex"
        >
          {onDeskStaffName ? (
            <>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success"
              />
              <span className="truncate text-success">
                {copy.nav.deskStatus(onDeskStaffName)}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
              <span className="truncate text-slate-400">{copy.nav.deskStatusEmpty}</span>
            </>
          )}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 xl:p-3">
        <GroupLabel>{copy.nav.groups.operations}</GroupLabel>
        <div className="space-y-1">
          {OWNER_SECTIONS.map((item) => (
            <NavLink key={item.href} isActive={pathname.startsWith(item.href)} item={item} />
          ))}
        </div>

        {/* Divider carries the grouping on the 68px rail, where labels are hidden. */}
        <div aria-hidden="true" className="my-3 border-t border-border/70 xl:hidden" />

        <GroupLabel>{copy.nav.groups.tools}</GroupLabel>
        <div className="space-y-1">
          {OWNER_TOOLS.map((item) => (
            <NavLink key={item.href} isActive={pathname.startsWith(item.href)} item={item} />
          ))}
        </div>
      </nav>

      {/* Dock: leave the cockpit, or leave entirely. */}
      <div className="space-y-2 border-t border-border/70 p-2 xl:p-3">
        <Link
          href="/dashboard"
          title={copy.nav.menu.switchToDesk}
          data-testid="switch-to-desk"
          className="flex h-10 items-center gap-2.5 rounded-lg border border-border/70 bg-surface-elevated px-3 text-xs font-medium text-slate-200 transition hover:border-border hover:bg-surface-elevated/70"
        >
          <Monitor aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="hidden truncate xl:block">{copy.nav.menu.switchToDesk}</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${ownerName}`}
            data-testid="owner-avatar"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-surface-elevated/60"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/70 bg-surface-elevated text-[11px] font-semibold text-slate-200">
              {initials(ownerName)}
            </span>
            <div className="hidden min-w-0 flex-1 xl:block">
              <p className="truncate text-xs font-bold text-white">{ownerName}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
                {copy.nav.brandSubtitle}
              </p>
            </div>
            <ChevronUp
              aria-hidden="true"
              className={`hidden h-4 w-4 shrink-0 text-slate-400 transition-transform xl:block ${
                isMenuOpen ? '' : 'rotate-180'
              }`}
              strokeWidth={2}
            />
          </button>

          {isMenuOpen ? (
            <div
              role="menu"
              data-testid="owner-dropdown"
              className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[200px] overflow-hidden rounded-lg border border-border/70 bg-surface-elevated shadow-2xl"
            >
              <Link
                href="/dashboard"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                data-testid="menu-switch-to-desk"
                className="flex h-10 items-center gap-2.5 px-3 text-sm text-slate-300 transition hover:bg-surface-elevated/70 hover:text-white"
              >
                <Monitor aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                {copy.nav.menu.switchToDesk}
              </Link>
              <div className="border-t border-border/70" />
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                data-testid="sidebar-sign-out"
                className="flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm text-slate-300 transition hover:bg-surface-elevated/70 hover:text-white"
              >
                <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                {copy.nav.menu.signOut}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
