'use client';

import { useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/lib/types';

const DEMO_EMAIL = 'reception@ironparadise.com';
const VALID_ROLES = new Set<UserRole>(['receptionist', 'owner', 'superadmin', 'trainer']);

type LoginFormProps = {
  initialAuthError?: string;
  nextPath: string | null;
};

function getInitialMessage(error: string | undefined): string | null {
  if (error === 'invalid_claims') {
    return 'Your account is missing valid tenant access. Contact your administrator.';
  }

  return null;
}

/**
 * Distinguishes a genuine credential rejection from a backend/transport failure.
 *
 * Supabase returns HTTP 400 with code `invalid_credentials` only when the email
 * or password is actually wrong. Anything else -- a paused project (DNS
 * failure), a cold-starting auth gateway (502), an auth/database schema fault
 * (500), or rate limiting (429) -- is an availability problem. Collapsing those
 * into "Invalid email or password" sends operators chasing phantom password
 * bugs, so each class gets its own actionable message.
 */
function describeSignInError(error: {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
}): string {
  const status = error.status;
  const code = error.code;

  if (code === 'invalid_credentials' || (status === 400 && !code)) {
    return 'Invalid email or password. Please try again.';
  }

  if (code === 'email_not_confirmed') {
    return 'This email address has not been confirmed yet.';
  }

  if (status === 429 || code === 'over_request_rate_limit') {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }

  // Thrown fetch/DNS failures surface as AuthRetryableFetchError with status 0
  // or undefined; a paused Supabase project lands here.
  if (!status || status === 0 || error.name === 'AuthRetryableFetchError') {
    return 'Cannot reach the authentication server. Check your connection or confirm the Supabase project is active, then try again.';
  }

  if (status >= 500) {
    return `The authentication server is unavailable (error ${status}). It may still be starting up — please retry shortly.`;
  }

  return `Sign-in failed (error ${status}). Please try again or contact your administrator.`;
}

export function LoginForm({ initialAuthError, nextPath }: LoginFormProps) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    getInitialMessage(initialAuthError),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(describeSignInError(error));
        return;
      }

      if (!data.user) {
        setErrorMessage('Sign-in did not return an account. Please try again.');
        return;
      }

      const role = data.user.app_metadata.role;
      const tenantId = data.user.app_metadata.tenant_id;

      if (
        typeof role !== 'string' ||
        !VALID_ROLES.has(role as UserRole) ||
        typeof tenantId !== 'string'
      ) {
        await supabase.auth.signOut();
        setErrorMessage('This account does not have valid GymOS access.');
        return;
      }

      // Owners run the business from the cockpit; the front desk is a side trip
      // for them, so land them where their work actually starts.
      const roleDestination =
        role === 'superadmin' ? '/superadmin' : role === 'owner' ? '/owner/dashboard' : '/dashboard';
      const destination = nextPath ?? roleDestination;

      // A full document navigation guarantees the browser has committed the
      // freshly written session cookie before middleware evaluates the next
      // request. router.replace() issues an RSC fetch that can race that write
      // and get redirected straight back to /login.
      window.location.assign(destination);
      return;
    } catch (thrown) {
      // createClient() misconfiguration or a hard network fault can throw
      // rather than resolve with an error payload. Never let that surface as a
      // credential problem.
      setErrorMessage(
        thrown instanceof Error && /fetch|network/i.test(thrown.message)
          ? 'Cannot reach the authentication server. Check your connection or confirm the Supabase project is active, then try again.'
          : 'Unexpected sign-in error. Please try again or contact your administrator.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function useDemoEmail() {
    setEmail(DEMO_EMAIL);
    setErrorMessage(null);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-canvas/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-accent focus:ring-4 focus:ring-accent/10"
          placeholder="you@gym.com"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            Password
          </label>
          <span className="text-xs text-slate-500">Secure staff login</span>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-canvas/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-accent focus:ring-4 focus:ring-accent/10"
          placeholder="Enter your password"
        />
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-bold text-slate-950 shadow-cyan-glow transition hover:bg-cyan-300 focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
            Processing…
          </>
        ) : (
          'Sign in to GymOS'
        )}
      </button>

      <div className="rounded-xl border border-border/70 bg-canvas/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Live test account
            </p>
            <p className="mt-1 text-xs text-slate-500">{DEMO_EMAIL}</p>
          </div>
          <button
            type="button"
            onClick={useDemoEmail}
            className="shrink-0 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20"
          >
            Use email
          </button>
        </div>
      </div>
    </form>
  );
}
