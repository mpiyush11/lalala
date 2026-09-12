'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) {
        setErrorMessage('Unable to log out. Please try again.');
        setIsSigningOut(false);
        return;
      }

      // Use a hard navigation so no authenticated Server Component payload or
      // router cache survives after the Supabase auth cookies are removed.
      window.location.replace('/login');
    } catch {
      setErrorMessage('Unable to log out. Please try again.');
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {errorMessage ? (
        <span role="alert" className="hidden text-xs text-red-300 sm:inline">
          {errorMessage}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-slate-300 transition hover:border-danger/50 hover:text-white focus:outline-none focus:ring-4 focus:ring-danger/10 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5" />
        </svg>
        <span className="hidden sm:inline">{isSigningOut ? 'Logging out…' : 'Logout'}</span>
      </button>
    </div>
  );
}
