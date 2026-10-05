'use client';

import {
  BadgeIndianRupee,
  FileCheck,
  Home,
  Monitor,
  Settings,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

/**
 * Exactly four high-frequency tabs. No "More" tab by design.
 *
 * Vector icons, not emoji: emoji resolve against a system font that several
 * Android webviews simply do not ship, and the whole bar was rendering as tofu
 * boxes in testing. A bundled SVG cannot fail that way.
 */
const TABS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: '/owner/dashboard', icon: Home, label: copy.nav.tabs.home },
  { href: '/owner/dues', icon: BadgeIndianRupee, label: copy.nav.tabs.dues },
  { href: '/owner/staff', icon: Users, label: copy.nav.tabs.staff },
  { href: '/owner/plans', icon: Tag, label: copy.nav.tabs.plans },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Phone header: brand, desk status, and the profile door to everything
 * low-frequency (settings, bill verification, staff, sign out).
 */
export function OwnerMobileHeader({
  gymName,
  onDeskStaffName,
  ownerName,
}: {
  gymName: string;
  onDeskStaffName: string | null;
  ownerName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.replace('/login');
  }

  return (
    <header
      data-testid="owner-mobile-header"
      className="sticky top-0 z-40 border-b border-border/70 bg-canvas/90 backdrop-blur-xl lg:hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{gymName}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] font-medium">
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

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${ownerName}`}
            data-testid="owner-avatar"
            className="grid h-11 w-11 place-items-center rounded-full border border-border/70 text-xs font-medium text-slate-200 transition active:scale-[0.98]"
          >
            {initials(ownerName)}
          </button>

          {isOpen ? (
            <div
              role="menu"
              data-testid="owner-dropdown"
              className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border/70 bg-surface-elevated shadow-2xl"
            >
              <div className="border-b border-border/70 px-4 py-3">
                <p className="truncate text-sm font-bold text-white">{ownerName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                  {copy.nav.brandSubtitle} · {gymName}
                </p>
              </div>
              {(
                [
                  { href: '/owner/verify-receipt', icon: FileCheck, label: copy.nav.menu.verifyBill },
                  { href: '/owner/settings', icon: Settings, label: copy.nav.menu.settings },
                  { href: '/dashboard', icon: Monitor, label: copy.nav.menu.switchToDesk },
                ] as { href: string; icon: LucideIcon; label: string }[]
              ).map((item) => {
                const ItemIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setIsOpen(false)}
                    className="flex min-h-[44px] items-center gap-2.5 px-4 text-sm text-slate-300 transition hover:bg-surface-elevated hover:text-white"
                  >
                    <ItemIcon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-border/70" />
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-sm text-slate-300 transition hover:bg-surface-elevated hover:text-white"
              >
                {copy.nav.menu.signOut}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** Thumb-reachable four-tab bar; hidden from 1024px up where the sidebar rules. */
export function OwnerBottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Owner sections"
      data-testid="owner-bottom-nav"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-[62px] items-stretch justify-around border-t border-border/70 bg-canvas/90 backdrop-blur-md lg:hidden"
    >
      {TABS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            data-testid="bottom-tab"
            className={`relative flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:scale-[0.96] ${
              isActive ? 'text-accent' : 'text-slate-500'
            }`}
          >
            {/* Explicit active rail: colour alone is easy to miss in daylight. */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-3 top-0 h-0.5 rounded-full transition ${
                isActive ? 'bg-accent' : 'bg-transparent'
              }`}
            />
            <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={isActive ? 2.25 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function OwnerBottomNavSpacer() {
  return <div aria-hidden="true" className="h-20 lg:hidden" />;
}
