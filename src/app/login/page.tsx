import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

type LoginPageProps = {
  searchParams: {
    auth_error?: string;
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath =
    searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//')
      ? searchParams.next
      : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 20%, rgba(34,211,238,.18), transparent 28%), radial-gradient(circle at 82% 78%, rgba(16,185,129,.10), transparent 24%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(60,73,76,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(60,73,76,.07)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <section className="relative w-full max-w-md rounded-3xl border border-border/80 bg-surface/95 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-accent/30 bg-accent/10 shadow-cyan-glow">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-white">GymOS</p>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Operations Console
            </p>
          </div>
        </div>

        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Staff access
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sign in to manage members, payments, and today&apos;s front-desk activity.
          </p>
        </div>

        <LoginForm nextPath={nextPath} initialAuthError={searchParams.auth_error} />
      </section>
    </main>
  );
}
