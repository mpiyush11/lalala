/**
 * Input hygiene helpers shared by every member-facing form.
 *
 * Front-desk staff routinely paste phone numbers copied from WhatsApp, SMS, or
 * spreadsheets, in wildly inconsistent shapes. Normalising centrally keeps the
 * database clean and prevents duplicate members caused purely by formatting.
 */

/** Strict Indian mobile: 10 digits starting 6-9. */
export const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

/**
 * Reduces arbitrary pasted text to a clean 10-digit Indian mobile number.
 *
 * Handles the shapes staff actually paste:
 *   "+91 98290-12345"  -> "9829012345"
 *   "098290 12345"     -> "9829012345"
 *   "0091-9829012345"  -> "9829012345"
 *   "(98290) 12345"    -> "9829012345"
 *
 * Country code and trunk prefixes are only stripped when doing so leaves a
 * plausible 10-digit number, so a legitimate number is never truncated.
 */
export function normalizeIndianMobile(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  // International prefix written as 00 91.
  if (digits.length > 10 && digits.startsWith('0091')) {
    digits = digits.slice(4);
  }

  // Country code 91 followed by a full number.
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // Domestic trunk prefix 0.
  while (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // A leading 0 on an 11-digit string is still a trunk prefix.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Keep the last 10 digits when extra leading noise survives.
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return digits;
}

/** True when the value is a valid 10-digit Indian mobile number. */
export function isValidIndianMobile(value: string): boolean {
  return INDIAN_MOBILE_PATTERN.test(value);
}

/** Stores phones in a single canonical E.164-style form. */
export function toStoredPhone(tenDigits: string): string {
  return `+91${tenDigits}`;
}

/** Recovers the 10-digit local part from a stored phone value. */
export function fromStoredPhone(stored: string): string {
  return normalizeIndianMobile(stored ?? '');
}

/**
 * Title-cases a person's name while preserving intentional inner punctuation.
 *
 * "rohan sharma"   -> "Rohan Sharma"
 * "MEERA  joshi"   -> "Meera Joshi"
 * "d'souza"        -> "D'Souza"
 * "jean-pierre"    -> "Jean-Pierre"
 */
export function toTitleCase(raw: string): string {
  return raw
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'.])([\p{L}])/gu, (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase()}`,
    );
}

/** Collapses runs of whitespace; use on blur so mid-typing spaces survive. */
export function collapseWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Strips everything except digits — for positive integer money fields. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Blocks keystrokes that `<input type="number">` otherwise accepts.
 *
 * Browsers permit 'e', 'E', '+', and '-' in number inputs, which yields
 * exponents and negative amounts. Money fields must reject all of them.
 */
export function blockNonIntegerKeys(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (['e', 'E', '+', '-', '.'].includes(event.key)) {
    event.preventDefault();
  }
}
