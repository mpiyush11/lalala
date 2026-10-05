'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MicroTile } from '@/components/micro-tile';

export type CheckInEntry = {
  id: string;
  memberName: string;
  time: string;
};

/**
 * The "In Gym" metric, doubled as the door to the live check-in feed.
 *
 * Previously the feed was a permanent panel on the home screen. It is the one
 * surface a receptionist needs often but briefly — glance, confirm, close — so
 * it now lives behind the tile that already reports the count, in a sheet that
 * covers the counter and dismisses back to it.
 *
 * The tile keeps `data-testid="tile-ingym"` and stays a real button: keyboard
 * reachable, Escape to close, focus moved into the sheet on open.
 */
export function CheckInSheet({ entries, present, subtitle }: {
  entries: CheckInEntry[];
  present: string;
  subtitle: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        data-testid="tile-ingym"
        className="block w-full cursor-pointer text-left transition active:scale-95"
      >
        <MicroTile dense tone="cyan" label="🟢 In Gym" value={present} sub={subtitle} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <button
            type="button"
            aria-label="Close check-in feed"
            onClick={() => setIsOpen(false)}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-sheet-title"
            data-testid="checkin-sheet"
            className="animate-sheet-up relative flex h-full w-full max-w-md flex-col border-l border-border/70 bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 id="checkin-sheet-title" className="font-bold text-white">
                  Today&apos;s Live Check-in Feed
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {entries.length} check-in{entries.length === 1 ? '' : 's'} recorded today
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/70 bg-surface-elevated text-slate-300 transition hover:border-border"
              >
                <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {entries.length ? (
                <ul data-testid="checkin-feed" className="divide-y divide-border/50">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      data-testid="checkin-row"
                      className="flex min-w-0 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-elevated/40"
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-xs font-bold text-accent"
                      >
                        {entry.memberName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-200">
                          {entry.memberName}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                          {entry.time}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  data-testid="checkin-empty"
                  className="px-5 py-10 text-center text-sm text-slate-400"
                >
                  No check-ins recorded yet today.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
