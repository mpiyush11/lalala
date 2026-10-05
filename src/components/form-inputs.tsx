'use client';

import type { ChangeEvent, ClipboardEvent, FocusEvent } from 'react';

import {
  blockNonIntegerKeys,
  collapseWhitespace,
  digitsOnly,
  normalizeIndianMobile,
  toTitleCase,
} from '@/lib/format/input';

// text-base (16px) on mobile blocks iOS/Android focus auto-zoom.
const FIELD_CLASS =
  'h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 text-base text-white outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50 sm:border-zinc-800';

/**
 * Phone field locked to a 10-digit Indian mobile with a static +91 badge.
 *
 * The badge is rendered outside the input so the country code can never be
 * edited or accidentally duplicated by a paste.
 */
export function PhoneField({
  autoFocus,
  id = 'phone-number',
  label = 'Phone number',
  onChange,
  required = true,
  value,
}: {
  autoFocus?: boolean;
  id?: string;
  label?: string;
  onChange: (tenDigits: string) => void;
  required?: boolean;
  value: string;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Typing is restricted to digits and hard-capped at 10.
    onChange(digitsOnly(event.target.value).slice(0, 10));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    // Intercept the paste so messy clipboard text is normalised rather than
    // truncated by the digits-only rule above.
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    onChange(normalizeIndianMobile(pasted).slice(0, 10));
  }

  const isIncomplete = value.length > 0 && value.length < 10;
  const hasBadPrefix = value.length > 0 && !/^[6-9]/.test(value);

  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <div className="flex items-stretch">
        <span
          aria-hidden="true"
          className="inline-flex h-12 min-h-[44px] shrink-0 select-none items-center rounded-l-xl border border-r-0 border-zinc-700/80 bg-zinc-900 px-3 font-mono text-base font-semibold text-slate-400 sm:border-zinc-800 sm:text-sm"
        >
          +91
        </span>
        <input
          id={id}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          required={required}
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
          }}
          placeholder="98290 12345"
          aria-describedby={`${id}-hint`}
          className={`${FIELD_CLASS} rounded-l-none font-mono tracking-wide`}
        />
      </div>
      <span id={`${id}-hint`} className="mt-1.5 block text-xs text-slate-500">
        {hasBadPrefix ? (
          <span className="text-danger">Indian mobile numbers start with 6, 7, 8, or 9.</span>
        ) : isIncomplete ? (
          <span className="text-amber-300">{10 - value.length} more digit(s) required.</span>
        ) : (
          'Paste any format — +91, spaces, and dashes are cleaned automatically.'
        )}
      </span>
    </label>
  );
}

/** Full-name field that title-cases as the receptionist types. */
export function NameField({
  autoFocus,
  id = 'full-name',
  label = 'Full name',
  onChange,
  value,
}: {
  autoFocus?: boolean;
  id?: string;
  label?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(toTitleCase(event.target.value));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    onChange(toTitleCase(collapseWhitespace(event.target.value)));
  }

  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input
        id={id}
        name="fullName"
        type="text"
        autoComplete="name"
        autoFocus={autoFocus}
        required
        maxLength={160}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Rohan Sharma"
        className={FIELD_CLASS}
      />
    </label>
  );
}

/** Positive-integer money field: no exponents, no negatives, no decimals. */
export const MIN_PAID_AMOUNT = 1;
export const MAX_PAID_AMOUNT = 100_000;

export function AmountField({
  currency,
  disabled,
  hint,
  id = 'amount',
  label,
  onChange,
  value,
}: {
  currency: string;
  disabled?: boolean;
  hint?: string;
  id?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const numeric = Number(value);
  const isOverMax = value !== '' && Number.isFinite(numeric) && numeric > MAX_PAID_AMOUNT;
  const isUnderMin = value !== '' && Number.isFinite(numeric) && numeric < MIN_PAID_AMOUNT;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">
        {label} ({currency})
      </span>
      <div className="flex items-stretch">
        <span
          aria-hidden="true"
          className="inline-flex h-12 min-h-[44px] shrink-0 select-none items-center rounded-l-xl border border-r-0 border-zinc-700/80 bg-zinc-900 px-3 font-mono text-base font-semibold text-slate-400 sm:border-zinc-800 sm:text-sm"
        >
          ₹
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          required
          value={value}
          onChange={(event) => onChange(clampAmount(digitsOnly(event.target.value)))}
          onKeyDown={blockNonIntegerKeys}
          onPaste={(event) => {
            event.preventDefault();
            onChange(clampAmount(digitsOnly(event.clipboardData.getData('text'))));
          }}
          placeholder="1000"
          className={`${FIELD_CLASS} rounded-l-none font-mono tabular-nums`}
        />
      </div>
      {isOverMax || isUnderMin ? (
        <span className="mt-1.5 block text-xs text-danger">
          {isOverMax
            ? `Maximum allowed is ₹${MAX_PAID_AMOUNT.toLocaleString('en-IN')}.`
            : `Minimum allowed is ₹${MIN_PAID_AMOUNT}.`}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

/** Caps a digit string at the maximum permitted transaction value. */
function clampAmount(digits: string): string {
  if (!digits) return '';
  const trimmed = digits.replace(/^0+(?=\d)/, '').slice(0, 7);
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.min(parsed, MAX_PAID_AMOUNT));
}
