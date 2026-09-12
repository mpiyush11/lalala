import type { ReactNode } from 'react';

/**
 * Universal compact metric tile for phones.
 *
 * Locked to ~75px so a 2x2 grid never turns into vertically stretched
 * "monster cards". Used by the dashboard, payments hub, and staff ledger so
 * every metric surface shares one visual language.
 */
export function MicroTile({
  label,
  sub,
  tone = 'slate',
  value,
}: {
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

  return (
    <div className="flex h-[75px] flex-col justify-center overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-3 py-2">
      <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub ? <p className="truncate text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
