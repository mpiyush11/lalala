import type { ReactNode } from 'react';

/**
 * Universal compact metric tile for phones.
 *
 * Two densities:
 *   default — ~75px, so a 2x2 grid never turns into vertically stretched
 *             "monster cards". Used by the payments hub and the staff ledger.
 *   dense   — ~58px, for the reception desk's first fold, where four metrics
 *             plus the POS actions have to fit one phone screen with an alert
 *             banner showing.
 *
 * Both shapes share one visual language; only the measure changes.
 *
 * CLIPPING: this tile is a fixed-height flex column, and a flex item's default
 * `flex-shrink: 1` lets each line be squeezed below its own line-height — which
 * cuts the descenders (g, y, p) off labels like "In Gym" and "Expiring" while
 * the DOM still reports the full string. Two things prevent it:
 *   `leading-tight` — a bounded line box instead of `normal` (1.5), so the
 *                     three lines provably fit the fixed height;
 *   `shrink-0`      — a line can never be compressed below that box.
 * The container keeps `overflow-hidden` (the rounded corners and `truncate`
 * both need it); it is no longer doing the clipping.
 */
export function MicroTile({
  dense = false,
  label,
  sub,
  tone = 'slate',
  value,
}: {
  dense?: boolean;
  label: string;
  sub?: ReactNode;
  tone?: 'cyan' | 'emerald' | 'amber' | 'slate' | 'rose';
  value: string;
}) {
  const tones = {
    amber: 'text-amber-300',
    cyan: 'text-accent',
    emerald: 'text-success',
    rose: 'text-danger',
    slate: 'text-white',
  } as const;

  const shell = dense
    ? 'flex h-[58px] shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-border/70 bg-surface px-2.5 py-1'
    : 'flex h-[75px] shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-border/70 bg-surface px-3 py-2';

  return (
    <div className={shell}>
      <p
        className={`shrink-0 truncate text-[10px] font-medium leading-tight text-slate-400 ${
          dense ? '' : 'sm:text-[11px]'
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 shrink-0 truncate font-bold leading-tight tabular-nums ${
          dense ? 'text-lg' : 'text-xl'
        } ${tones[tone]}`}
      >
        {value}
      </p>
      {sub ? (
        <p
          className={`shrink-0 truncate text-[9px] leading-tight text-slate-500 ${
            dense ? '' : 'sm:text-[10px]'
          }`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
