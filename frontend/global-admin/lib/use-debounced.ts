'use client';

import { useEffect, useState } from 'react';

/** Shared debounce hook — frontend/web's admin section currently inlines
 * this locally per-page; promoted here since it's used by multiple list
 * pages' search inputs in this app. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
