'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ownerCopy as copy } from '@/lib/copy/owner';
import { createClient } from '@/lib/supabase/client';

type SidebarItem = {
  href: string;
  icon: string;
  label: string;
};

/** Strictly the five operational destinations an owner uses daily. */
export const OWNER_SECTIONS: SidebarItem[] = [
  { href: '/owner/dashboard', icon: '🏠', label: copy.nav.sections.home },
  { href: '/owner/dues', icon: '💰', label: copy.nav.sections.dues },
  { href: '/owner/staff', icon: '🧾', label: copy.nav.sections.staff },
  { href: '/owner/plans', icon: '🏷️', label: copy.nav.sections.plans },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Persistent desktop sidebar — the counter's back wall.
 *
 * Full 232px from 1280px up; a 68px icon rail between 1024px and 1279px so the
 * two-column workspace still gets its full width on a laptop screen. Hidden
 * entirely below 1024px, where the bottom tab bar takes over.
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
    <aside
      data-testid="owner-sidebar"
      aria-label="Owner sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col border-r border-zinc-800 bg-zinc-950 lg:flex xl:w-[232px]"
    >
      {/* 1 — Brand & who is on the desk right now */}
      <div className="border-b border-zinc-800 px-3 py-4 xl:px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-800 text-base">
            🛡️
          </span>
          <p
            data-testid="sidebar-brand"
            className="hidden min-w-0 truncate text-sm font-medium text-zinc-100 xl:block"
          >
            {gymName}
          </p>
        </div>
        <p
          data-testid="sidebar-desk-status"
          className="mt-2 hidden truncate text-[11px] font-semibold xl:block"
        >
          {onDeskStaffName ? (
            <span className="text-emerald-500">● {copy.nav.deskStatus(onDeskStaffName)}</span>
          ) : (
            <span className="text-zinc-600">○ {copy.nav.deskStatusEmpty}</span>
          )}
        </p>
      </div>

      {/* 2–6 — Operational destinations */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2 xl:p-3">
        {OWNER_SECTIONS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              data-testid="sidebar-link"
              className={`relative flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-zinc-900 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300'
              }`}
            >
              <span aria-hidden="true" className="shrink-0 text-base leading-none">
                {item.icon}
              </span>
              <span className="hidden min-w-0 truncate xl:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 7 — Footer: front desk jump + profile */}
      <div className="space-y-1.5 border-t border-zinc-800 p-2 xl:p-3">
        <Link
          href="/dashboard"
          title={copy.nav.menu.switchToDesk}
          data-testid="switch-to-desk"
          className="flex h-11 items-center gap-2.5 rounded-lg border border-zinc-800 px-3 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.98]"
        >
          <span aria-hidden="true" className="shrink-0 text-base leading-none">
            🖥
          </span>
          <span className="hidden truncate xl:block">{copy.nav.menu.switchToDesk}</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${ownerName}`}
            data-testid="owner-avatar"
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition hover:bg-zinc-900"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-700 text-[11px] font-medium text-zinc-300">
              {initials(ownerName)}
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-xs text-zinc-400 xl:block">
              {ownerName}
            </span>
          </button>

          {isOpen ? (
            <div
              role="menu"
              data-testid="owner-dropdown"
              className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
            >
              <div className="border-b border-zinc-800 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-100">{ownerName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  {copy.nav.brandSubtitle} · {gymName}
                </p>
              </div>
              <Link
                href="/owner/settings"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex h-11 items-center gap-2.5 px-4 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
              >
                ⚙️ {copy.nav.menu.settings}
              </Link>
              <Link
                href="/owner/verify-receipt"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex h-11 items-center gap-2.5 px-4 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
              >
                🧾 {copy.nav.menu.verifyBill}
              </Link>
              <div className="border-t border-zinc-800" />
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="flex h-11 w-full items-center gap-2.5 px-4 text-left text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
              >
                🚪 {copy.nav.menu.signOut}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
