'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Desktop-only staff avatar + dropdown.
 *
 * Hidden below 640px, where the bottom tab bar owns Profile and the profile
 * page owns Sign Out. Keeping logout out of the mobile tab bar avoids a
 * destructive action sitting a stray thumb-tap away from navigation.
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
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
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
    if (isSigningOut) return;
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.replace('/login');
  }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="relative hidden sm:block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Account menu for ${fullName}`}
        data-testid="profile-avatar"
        className="grid h-10 w-10 place-items-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-accent transition hover:border-accent/50 active:scale-[0.98]"
      >
        {initials(fullName)}
      </button>

      {isOpen ? (
        <div
          role="menu"
          data-testid="profile-dropdown"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="truncate text-sm font-bold text-white">{fullName}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {roleLabel}
              </span>
              <span className="truncate text-[11px] text-slate-500">{gymName}</span>
            </div>
          </div>

          {/* Owners land on the cockpit by default but often work the desk;
              this is the way back. Rendered only for owners — a receptionist
              who followed the link would be bounced by middleware anyway, but
              showing it would advertise a door they cannot open. */}
          {role === 'owner' || role === 'superadmin' ? (
            <Link
              href="/owner/dashboard"
              role="menuitem"
              data-testid="switch-to-cockpit"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-zinc-800 hover:text-white"
            >
              <span aria-hidden="true">⚙️</span>
              Owner Cockpit
            </Link>
          ) : null}

          <Link
            href="/staff-activity"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <span aria-hidden="true">📊</span>
            My Activity / Shift Ledger
          </Link>

          <div className="border-t border-zinc-800" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={isSigningOut}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
          >
            <span aria-hidden="true">🚪</span>
            {isSigningOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
