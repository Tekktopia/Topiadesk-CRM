'use client';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './auth/constants';

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

/**
 * Echoes td_csrf's current value back as a header for state-changing
 * requests — middleware.ts's double-submit check requires this on every
 * POST/PUT/PATCH/DELETE to `/api/**`. Every route group's own `apiFetch`
 * (app/(*)/_lib/api.ts, kept-in-sync-by-hand like everything else in that
 * family) spreads this into its headers object. GET/HEAD/OPTIONS return
 * `{}` — nothing for the header to protect there.
 */
export function csrfHeaders(method?: string): Record<string, string> {
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return {};
  const token = readCsrfCookie();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}
