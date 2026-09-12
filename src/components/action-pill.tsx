import type { ReactNode } from 'react';

/**
 * Compact in-row action: 28px tall, hugging its label.
 *
 * Monochrome by default. Colour is information, not decoration — so a zinc
 * outline is the baseline and the single emerald accent is spent only on the
 * primary money-in action. Anything that needs a large tap target is a
 * page-level CTA, never a row action.
 */
const TONES = {
  /** The one accent in the product: taking money. */
  primary: 'bg-emerald-600 text-white font-medium hover:bg-emerald-500',
  /** Everything else, including destructive actions. */
  quiet: 'border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
} as const;

export type PillTone = keyof typeof TONES;

const BASE =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 text-xs leading-none transition active:scale-[0.97] disabled:opacity-40';

/** Square variant for a lone glyph, so the icon stays optically centred. */
const ICON = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs leading-none transition active:scale-[0.97] disabled:opacity-40';

export function PillButton({
  children,
  disabled,
  icon,
  onClick,
  testId,
  tone = 'quiet',
  ...rest
}: {
  children: ReactNode;
  disabled?: boolean;
  icon?: boolean;
  onClick?: () => void;
  testId?: string;
  tone?: PillTone;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`${icon ? ICON : BASE} ${TONES[tone]}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PillLink({
  children,
  external,
  href,
  icon,
  testId,
  title,
  tone = 'quiet',
  ...rest
}: {
  children: ReactNode;
  external?: boolean;
  href: string;
  icon?: boolean;
  testId?: string;
  title?: string;
  tone?: PillTone;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <a
      href={href}
      title={title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      data-testid={testId}
      className={`${icon ? ICON : BASE} ${TONES[tone]}`}
      {...rest}
    >
      {children}
    </a>
  );
}
