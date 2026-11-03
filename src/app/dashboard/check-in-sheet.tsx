'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type CheckInEntry = {
  /** Pre-formatted auto-exit copy, e.g. "Auto-exit in 68m" or "Auto-exited". */
  autoExitLabel: string;
  id: string;
  memberCode: string;
  memberName: string;
  time: string;
  /** Deterministic-ish tint for the initials circle; keeps rows scannable. */
  tint: string;
};

type FloorFilter = 'active' | 'exited';

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

function isAutoExited(entry: CheckInEntry): boolean {
  return entry.autoExitLabel.startsWith('Auto-exited');
}

/**
 * KPI card 3 and the centered check-in log behind it.
 *
 * The trigger IS the third KPI card, so the KPI strip stays a
 * symmetric row of three rather than two cards plus a stray button. The footer
 * variant is the "View all today's check-ins" bar inside the Live check-ins
 * panel. Both open the SAME centered dialog — a right-hand slide-over was the
 * previous behaviour and it read as navigation rather than a detail view.
 */
export function CheckInSheet({
  entries,
  expiringCount,
  footerLabel,
  present,
  subtitle,
  variant = 'card',
}: {
  entries: CheckInEntry[];
  expiringCount: number;
  footerLabel?: string;
  present: string;
  subtitle: string;
  /** 'card' -> KPI card 3. 'footer' -> the Live check-ins "view all" bar. */
  variant?: 'card' | 'footer';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FloorFilter>('active');

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const activeCount = entries.filter((entry) => !isAutoExited(entry)).length;
  const exitedCount = entries.length - activeCount;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === 'active' ? isAutoExited(entry) : !isAutoExited(entry)) return false;
      if (!needle) return true;
      return (
        entry.memberName.toLowerCase().includes(needle) ||
        entry.memberCode.toLowerCase().includes(needle)
      );
    });
  }, [entries, filter, query]);

  function open() {
    setQuery('');
    setFilter('active');
    setIsOpen(true);
  }

  return (
    <>
      {variant === 'footer' ? (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          data-testid="view-all-checkins"
          className="flex w-full shrink-0 items-center justify-center gap-1 border-t border-white/[0.06] py-3 text-xs text-zinc-300 transition hover:text-white"
        >
          {footerLabel ?? "View all today's check-ins"}
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          data-testid="tile-ingym"
          className="group rounded-2xl border border-white/[0.08] bg-[#111113] p-4 text-left shadow-xl transition hover:border-white/[0.08]"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
            Today&apos;s check-ins
          </span>
          <span className="mt-1.5 block font-mono text-3xl font-bold tabular-nums lining-nums tracking-normal text-white">
            {present}
          </span>
          <span className="mt-2 block truncate text-xs text-zinc-400">
            {subtitle}
            {expiringCount > 0 ? (
              <span data-testid="expiring-tile-mobile"> · {expiringCount} expiring in 48h</span>
            ) : null}
          </span>
        </button>
      )}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close check-in log"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-log-title"
            data-testid="checkin-sheet"
            className="animate-fade-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113] shadow-2xl"
          >
            {/* ---------------- Header ---------------- */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <h2 id="checkin-log-title" className="text-sm font-semibold text-white">
                Today&apos;s check-in log
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                data-testid="checkin-log-close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#141417] text-zinc-300 transition hover:bg-[#1A1A1E] hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* ---------------- Search + filters ---------------- */}
            <div className="shrink-0 space-y-3 border-b border-white/[0.06] px-5 py-4">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search check-ins..."
                aria-label="Search check-ins"
                data-testid="checkin-log-search"
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#141417] px-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10"
              />

              <div className="flex flex-wrap items-center gap-2" data-testid="checkin-log-pills">
                <button
                  type="button"
                  onClick={() => setFilter('active')}
                  aria-pressed={filter === 'active'}
                  className={
                    filter === 'active'
                      ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-xs text-emerald-400'
                      : 'rounded-xl border border-white/[0.08] bg-[#141417] px-4 py-1.5 text-xs text-zinc-400 transition hover:text-white'
                  }
                >
                  Active on floor · {activeCount}
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('exited')}
                  aria-pressed={filter === 'exited'}
                  className={
                    filter === 'exited'
                      ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-xs text-emerald-400'
                      : 'rounded-xl border border-white/[0.08] bg-[#141417] px-4 py-1.5 text-xs text-zinc-400 transition hover:text-white'
                  }
                >
                  Auto-exited · {exitedCount}
                </button>
              </div>
            </div>

            {/* ---------------- List ---------------- */}
            <div className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto">
              {visible.length ? (
                <ul data-testid="checkin-log-list">
                  {visible.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                      <span
                        aria-hidden="true"
                        className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${entry.tint}`}
                      >
                        {initialsOf(entry.memberName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">
                          {entry.memberName}
                        </p>
                        <p className="truncate font-mono text-[11px] text-zinc-500 tracking-normal">
                          {entry.memberCode} • Entered {entry.time}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                        {entry.autoExitLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-10 text-center text-xs text-zinc-500">
                  No check-ins match this filter.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
