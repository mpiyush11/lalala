/** Human-readable membership expiry indicators for directory and drawer views. */

export type ExpiryTone = 'active' | 'soon' | 'today' | 'expired';

export type ExpiryIndicator = {
  className: string;
  label: string;
  tone: ExpiryTone;
};

/** Whole days between two YYYY-MM-DD keys (negative when `to` is in the past). */
export function daysUntil(todayKey: string, targetKey: string): number {
  const a = Date.parse(`${todayKey}T00:00:00Z`);
  const b = Date.parse(`${targetKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Converts an expiry date into a badge the front desk can read at a glance.
 * "Expiring soon" is a 7-day window, matching the directory's filter tab.
 */
export function describeExpiry(todayKey: string, expiresOn: string): ExpiryIndicator {
  const days = daysUntil(todayKey, expiresOn);

  if (days < 0) {
    const ago = Math.abs(days);
    return {
      className: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/20',
      label: ago === 1 ? 'Expired yesterday' : `Expired ${ago} days ago`,
      tone: 'expired',
    };
  }

  if (days === 0) {
    return {
      className: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/20',
      label: 'Expires today',
      tone: 'today',
    };
  }

  if (days <= 7) {
    return {
      className: 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20',
      label: days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`,
      tone: 'soon',
    };
  }

  return {
    className: 'bg-success/10 text-success ring-1 ring-inset ring-success/20',
    label: `Expires in ${days} days`,
    tone: 'active',
  };
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Formats a YYYY-MM-DD key as "12 Sep 2026".
 *
 * Built from an explicit month table rather than Intl: the en-IN/en-GB locales
 * render September as the 4-letter "Sept", which breaks the uniform DD MMM
 * YYYY contract.
 */
export function formatDateKey(dateKey: string): string {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed)) return dateKey;

  const d = new Date(parsed);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Formats an ISO timestamp as `DD MMM YYYY` in the tenant timezone. */
export function formatTimestampDate(value: string, timeZone?: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );

  return formatDateKey(`${parts.year}-${parts.month}-${parts.day}`);
}

/** Compact money for micro-tile sub-labels: ₹4k, ₹1.2L, ₹800. */
export function compactMoney(amountMinor: number): string {
  const major = amountMinor / 100;
  if (Math.abs(major) >= 100_000) return `₹${(major / 100_000).toFixed(1)}L`;
  if (Math.abs(major) >= 1000) return `₹${Math.round(major / 1000)}k`;
  return `₹${Math.round(major)}`;
}
