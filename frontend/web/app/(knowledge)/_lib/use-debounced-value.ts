'use client';

import { useEffect, useState } from 'react';

/** Debounces a fast-changing value (e.g. a search input) for use as a
 * TanStack Query key/param — local copy of
 * app/(crm)/_lib/use-debounced-value.ts's shape (see _lib/api.ts's header
 * comment for why this isn't shared across route groups). */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
