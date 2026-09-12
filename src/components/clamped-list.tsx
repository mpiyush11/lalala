'use client';

import { useState, type ReactNode } from 'react';

export const CLAMP_LIMIT = 5;

/**
 * Universal "show N, then expand" wrapper.
 *
 * Long feeds previously pushed primary actions (Sign Out, CTAs) far below the
 * fold on phones. Every list surface clamps to the same limit so no single feed
 * dominates the viewport.
 *
 * Takes pre-rendered children rather than a `renderItem` callback: Server
 * Components cannot pass functions across the client boundary, but they can
 * pass already-rendered elements. Overflow items stay mounted and are hidden
 * with CSS so expanding is instant and needs no client-side data.
 */
export function ClampedList({
  children,
  className,
  label,
  limit = CLAMP_LIMIT,
  testId,
}: {
  children: ReactNode[];
  className?: string;
  /** Noun used in the expander, e.g. "Check-ins" -> "View All Check-ins (12)". */
  label: string;
  limit?: number;
  testId?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const items = Array.isArray(children) ? children : [children];
  const hasMore = items.length > limit;

  return (
    <>
      <ul className={className} data-testid={testId}>
        {items.map((child, index) => (
          <li
            key={index}
            className={!showAll && index >= limit ? 'hidden' : 'contents'}
            data-clamped={!showAll && index >= limit ? 'true' : 'false'}
          >
            {child}
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          data-testid={testId ? `${testId}-toggle` : undefined}
          className="flex min-h-[44px] w-full items-center justify-center border-t border-zinc-800 text-xs font-bold text-accent transition active:scale-[0.98]"
        >
          {showAll ? 'Show less ↑' : `View All ${label} (${items.length}) ↓`}
        </button>
      ) : null}
    </>
  );
}
