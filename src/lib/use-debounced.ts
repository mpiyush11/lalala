'use client';

import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly-changing value.
 *
 * Used for instant search so filtering runs once the receptionist pauses,
 * rather than on every keystroke. 150ms is below the ~200ms perceptual
 * threshold, so typing still feels immediate.
 */
export function useDebounced<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
