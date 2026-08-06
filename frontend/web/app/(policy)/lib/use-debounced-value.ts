'use client';

import { useEffect, useState } from 'react';

/** Debounces a fast-changing value (e.g. a search input) for use as a TanStack Query key/param — mirrors app/(crm)/_lib/use-debounced-value.ts. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
