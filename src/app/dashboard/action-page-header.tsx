import Link from 'next/link';

export function ActionPageHeader({
  description,
  isOwner = false,
  mobileTitle,
  showHubLinks = true,
  title,
}: {
  description: string;
  /** Renders the persistent Owner Cockpit shortcut for owner accounts. */
  isOwner?: boolean;
  /** Short title for < 640px so the header never ellipsis-truncates. */
  mobileTitle?: string;
  /** Hide the Members/Payments hub links on focused task screens. */
  showHubLinks?: boolean;
  title: string;
}) {
  return (
    <header className="border-b border-border/70 bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5 sm:gap-4 sm:px-6">
        <Link
          href="/dashboard"
          aria-label="Back to desk"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 text-sm font-semibold text-slate-300 transition hover:border-accent/50 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="sm:hidden">Back</span>
          <span className="hidden sm:inline">Back to Desk</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-accent sm:block">GymOS front desk</p>
          <h1 className="mt-1 truncate text-xl font-bold text-white sm:text-2xl">
            <span className="sm:hidden">{mobileTitle ?? title}</span>
            <span className="hidden sm:inline">{title}</span>
          </h1>
          <p className="mt-1 hidden truncate text-sm text-slate-500 sm:block">{description}</p>
        </div>
        {isOwner ? (
          <Link
            href="/owner"
            data-testid="owner-cockpit-badge"
            className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-400/25 active:scale-[0.98] sm:h-10 sm:min-h-0"
          >
            👑<span className="hidden sm:inline">Cockpit</span>
          </Link>
        ) : null}
        {showHubLinks ? (
        <nav className="hidden shrink-0 items-center gap-2 sm:flex" aria-label="Management hubs">
          <Link
            href="/dashboard/members"
            className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-slate-300 transition hover:border-accent/40 hover:text-accent sm:text-sm"
          >
            Members
          </Link>
          <Link
            href="/dashboard/payments"
            className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-slate-300 transition hover:border-accent/40 hover:text-accent sm:text-sm"
          >
            Payments
          </Link>
        </nav>
        ) : null}
      </div>
    </header>
  );
}
