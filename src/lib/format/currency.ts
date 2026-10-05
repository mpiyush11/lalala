/**
 * Single currency formatter for the whole app.
 *
 * Gym pricing is always whole rupees, so trailing `.00` is pure noise and
 * costs horizontal space that mobile tiles cannot spare. `maximumFractionDigits: 0`
 * renders ₹4,000 and ₹0 rather than ₹4,000.00.
 */
export function formatMoney(amountMinor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(amountMinor / 100);
}

/** Compact form for narrow mobile metric tiles: ₹1.2L, ₹4.5k, ₹800. */
export function formatMoneyCompact(amountMinor: number, currency = 'INR'): string {
  const major = amountMinor / 100;
  const symbol = currency === 'INR' ? '₹' : '';

  if (Math.abs(major) >= 100_000) return `${symbol}${(major / 100_000).toFixed(1)}L`;
  if (Math.abs(major) >= 10_000) return `${symbol}${(major / 1000).toFixed(1)}k`;

  return `${symbol}${Math.round(major).toLocaleString('en-IN')}`;
}
