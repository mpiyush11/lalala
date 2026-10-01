'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Mobile sign-out.
 *
 * Deliberately lives at the bottom of the profile page rather than in the
 * bottom tab bar, so a destructive action is never one stray thumb-tap away
 * from navigation.
 */
export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.replace('/login');
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isSigningOut}
      data-testid="mobile-sign-out"
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 text-sm font-bold text-danger transition active:scale-[0.98] disabled:opacity-60 sm:hidden"
    >
      <span aria-hidden="true">🚪</span>
      {isSigningOut ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
