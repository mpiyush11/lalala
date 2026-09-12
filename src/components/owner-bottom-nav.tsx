'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

/** Exactly four high-frequency tabs. No "More" tab by design. */
const TABS = [
  { href: '/owner/dashboard', icon: '🏠', label: copy.nav.tabs.home },
  { href: '/owner/dues', icon: '💰', label: copy.nav.tabs.dues },
  { href: '/owner/staff', icon: '🧾', label: copy.nav.tabs.staff },
  { href: '/owner/plans', icon: '🏷️', label: copy.nav.tabs.plans },
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
      className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-xl lg:hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{gymName}</p>
          <p className="truncate text-[11px] font-semibold">
            {onDeskStaffName ? (
              <span className="text-emerald-500">● {copy.nav.deskStatus(onDeskStaffName)}</span>
            ) : (
              <span className="text-zinc-600">○ {copy.nav.deskStatusEmpty}</span>
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
            className="grid h-11 w-11 place-items-center rounded-full border border-zinc-700 text-xs font-medium text-zinc-300 transition active:scale-[0.98]"
          >
            {initials(ownerName)}
          </button>

          {isOpen ? (
            <div
              role="menu"
              data-testid="owner-dropdown"
              className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
            >
              <div className="border-b border-zinc-800 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-100">{ownerName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  {copy.nav.brandSubtitle} · {gymName}
                </p>
              </div>
              {[
                { href: '/owner/verify-receipt', label: `🧾 ${copy.nav.menu.verifyBill}` },
                { href: '/owner/settings', label: `⚙️ ${copy.nav.menu.settings}` },
                { href: '/dashboard', label: `🖥 ${copy.nav.menu.switchToDesk}` },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex min-h-[44px] items-center gap-2.5 px-4 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-zinc-800" />
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
              >
                🚪 {copy.nav.menu.signOut}
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
      className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-[62px] items-stretch justify-around border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md lg:hidden"
    >
      {TABS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            data-testid="bottom-tab"
            className={`relative flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:scale-[0.96] ${
              isActive ? 'text-zinc-100' : 'text-zinc-500'
            }`}
          >
            {/* Explicit active rail: colour alone is easy to miss in daylight. */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-3 top-0 h-0.5 rounded-full transition ${
                isActive ? 'bg-zinc-100' : 'bg-transparent'
              }`}
            />
            <span aria-hidden="true" className="text-lg leading-none">
              {item.icon}
            </span>
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
