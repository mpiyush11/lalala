'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * A collapsible executive drawer for the reception terminal.
 *
 * Collapsed by default at EVERY breakpoint, desktop included. The desk is an
 * action-first surface: an open enquiry funnel and check-in feed together ate
 * roughly 60% of the desktop viewport and pushed the POS actions — search,
 * `+ Member`, `+ Collect` — below the fold. Both still exist, one tap away,
 * behind a bar that reports how much is waiting.
 *
 * Children are rendered exactly ONCE, never duplicated, so every `data-testid`
 * inside stays unique in the DOM and nothing double-renders its data hooks.
 *
 * The wrapper owns the card chrome at every size, so expanding never produces
 * a border inside a border.
 *
 * Hash-aware: the "In Gym" metric tile anchors to `#live-check-in-feed`. The
 * panel opens itself when the URL points at it — on first load and on later
 * navigation — instead of leaving the operator staring at a closed bar.
 */
export function CollapsiblePanel({
  ariaLabelledBy,
  badge,
  children,
  icon,
  id,
  label,
  testId,
}: {
  ariaLabelledBy?: string;
  badge: number;
  children: ReactNode;
  icon: ReactNode;
  id?: string;
  label: string;
  testId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!id) return undefined;

    const openForHash = () => {
      if (window.location.hash === `#${id}`) setIsOpen(true);
    };

    openForHash();
    window.addEventListener('hashchange', openForHash);
    return () => window.removeEventListener('hashchange', openForHash);
  }, [id]);

  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      data-testid={testId}
      className="overflow-hidden rounded-2xl border border-border/70 bg-surface"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        data-testid={`${testId}-toggle`}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-elevated/40 sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent"
          >
            {icon}
          </span>
          <span className="truncate text-sm font-medium text-slate-200">{label}</span>
        </span>

        <span className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent">
            {badge}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </span>
      </button>

      <div className={`border-t border-border/60 ${isOpen ? '' : 'hidden'}`}>{children}</div>
    </section>
  );
}
