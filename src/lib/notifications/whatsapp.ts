/**
 * WhatsApp click-to-chat link builders.
 *
 * wa.me requires a bare international number: digits only, no `+`, spaces,
 * or punctuation. Indian numbers entered locally (10 digits) are promoted to
 * the 91 country code so links work from any device.
 */

const DEFAULT_COUNTRY_CODE = '91';

/** Normalises a stored phone number into wa.me's digits-only format. */
export function toWhatsAppNumber(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, '');

  if (!digits) return null;

  // Local 10-digit Indian mobile -> prefix country code.
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`;

  // Handle a 0-prefixed trunk number (011... -> 11...).
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  // Reject anything too short to be a real international number.
  if (digits.length < 11 || digits.length > 15) return null;

  return digits;
}

function buildUrl(phoneNumber: string, message: string): string | null {
  const number = toWhatsAppNumber(phoneNumber);
  if (!number) return null;

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amountMinor / 100);
}

/** "Hello {Name}, payment of ₹{Amount} received for {GymName}. Digital Receipt: {URL}. Thank you!" */
export function buildReceiptWhatsAppUrl({
  amountMinor,
  currency,
  gymName,
  memberName,
  phoneNumber,
  receiptUrl,
}: {
  amountMinor: number;
  currency: string;
  gymName: string;
  memberName: string;
  phoneNumber: string;
  receiptUrl: string;
}): string | null {
  const message =
    `Hello ${memberName}, payment of ${formatAmount(amountMinor, currency)} received for ` +
    `${gymName}. Digital Receipt: ${receiptUrl}. Thank you!`;

  return buildUrl(phoneNumber, message);
}

/** "Hi {Name}, your membership at {GymName} expired on {Date}. Please renew..." */
export function buildRenewalWhatsAppUrl({
  expiredOn,
  gymName,
  memberName,
  phoneNumber,
}: {
  expiredOn: string;
  gymName: string;
  memberName: string;
  phoneNumber: string;
}): string | null {
  const message =
    `Hi ${memberName}, your membership at ${gymName} expired on ${expiredOn}. ` +
    'Please renew to continue uninterrupted workouts.';

  return buildUrl(phoneNumber, message);
}

/** Reminder for a member carrying an outstanding balance. */
export function buildDueReminderWhatsAppUrl({
  amountMinor,
  currency,
  gymName,
  memberName,
  phoneNumber,
}: {
  amountMinor: number;
  currency: string;
  gymName: string;
  memberName: string;
  phoneNumber: string;
}): string | null {
  const message =
    `Hi ${memberName}, this is a friendly reminder from ${gymName}: an amount of ` +
    `${formatAmount(amountMinor, currency)} is pending on your membership. ` +
    'Please settle it at the front desk. Thank you!';

  return buildUrl(phoneNumber, message);
}
