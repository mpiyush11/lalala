import type { ReactNode } from 'react';

/**
 * Universal compact metric tile for phones.
 *
 * Two densities:
 *   default — locked to ~75px so a 2x2 grid never turns into vertically
 *             stretched "monster cards". Used by the payments hub and the staff
 *             ledger.
 *   dense   — ~54px, roughly 30% shorter, for the reception desk's first fold.
 *             Four metrics plus the POS actions have to fit one phone screen
 *             with an alert banner showing, which the default shape did not
 *             manage on a 360x640 viewport.
 *
 * Both shapes share one visual language; only the measure changes.
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
    ? 'flex h-[54px] flex-col justify-center overflow-hidden rounded-xl border border-border/70 bg-surface px-2.5 py-1.5'
    : 'flex h-[75px] flex-col justify-center overflow-hidden rounded-xl border border-border/70 bg-surface px-3 py-2';

  return (
    <div className={shell}>
      <p className={`truncate font-medium text-slate-400 ${dense ? 'text-[10px]' : 'text-[11px]'}`}>
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-bold tabular-nums ${dense ? 'text-lg' : 'text-xl'} ${tones[tone]}`}
      >
        {value}
      </p>
      {sub ? (
        <p className={`truncate text-slate-500 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>{sub}</p>
      ) : null}
    </div>
  );
}
