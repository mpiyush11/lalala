/**
 * Timezone-aware date helpers for tenant-local reporting windows.
 *
 * All dashboard metrics ("today's collection", "today's check-ins") must be
 * bounded by midnight in the *tenant's* timezone, not the server's. These
 * helpers resolve that boundary to a UTC instant without pulling in a date
 * library, and remain correct across DST transitions.
 */

export type DateParts = {
  day: number;
  month: number;
  year: number;
};

const datePartFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function getDateParts(date: Date, timeZone: string): DateParts {
  let formatter = datePartFormatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    });
    datePartFormatterCache.set(timeZone, formatter);
  }

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: Number(values.day),
    month: Number(values.month),
    year: Number(values.year),
  };
}

/** Converts midnight in an IANA timezone to its UTC instant without a date library. */
export function localMidnightUtc(parts: DateParts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let candidate = target;

  // Iterating resolves the timezone offset and remains correct across DST boundaries.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = getDateParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day);
    candidate += target - observedAsUtc;
  }

  // Date-only iteration cannot resolve the time-of-day offset. Use a full formatter
  // at the candidate instant to calculate the remaining hours/minutes adjustment.
  const fullFormatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  });
  const fullParts = Object.fromEntries(
    fullFormatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]),
  );
  const observedDateTime = Date.UTC(
    Number(fullParts.year),
    Number(fullParts.month) - 1,
    Number(fullParts.day),
    Number(fullParts.hour),
    Number(fullParts.minute),
    Number(fullParts.second),
  );

  return new Date(candidate + (target - observedDateTime));
}

export function getTodayRange(timeZone: string): { start: string; end: string } {
  const today = getDateParts(new Date(), timeZone);
  const nextDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const tomorrow: DateParts = {
    day: nextDate.getUTCDate(),
    month: nextDate.getUTCMonth() + 1,
    year: nextDate.getUTCFullYear(),
  };

  return {
    start: localMidnightUtc(today, timeZone).toISOString(),
    end: localMidnightUtc(tomorrow, timeZone).toISOString(),
  };
}

/** Returns a tenant-local calendar date (YYYY-MM-DD) offset by `days` from today. */
export function localDateKey(timeZone: string, offsetDays = 0): string {
  const today = getDateParts(new Date(), timeZone);
  const shifted = new Date(
    Date.UTC(today.year, today.month - 1, today.day + offsetDays),
  );

  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
