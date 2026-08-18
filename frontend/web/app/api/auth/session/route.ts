import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';
import type { AuthenticatedUser } from '@/lib/auth/types';

export const runtime = 'nodejs';

/**
 * GET /api/auth/session — same-origin proxy the client-side
 * `useCurrentUser()` hook calls. The access token lives only in an
 * HttpOnly cookie (invisible to browser JS), so the client can't call
 * backend/api's GET /identity/me directly with an Authorization header; this
 * route does it server-side (via `fetchApi`, which also silently refreshes
 * the access token first if it's near expiry) and forwards the JSON shape
 * straight through — see backend/api/src/modules/identity/identity.controller.ts
 * for the response contract this mirrors.
 *
 * Returns `{ user: null }` (200, not 401) when GENUINELY unauthenticated —
 * this is a "tell me who's logged in, if anyone" endpoint the client can
 * poll safely without treating "no session" as an error state.
 *
 * A transient failure to even REACH backend/api (network error, backend
 * mid-restart, etc.) is deliberately NOT collapsed into the same `{ user:
 * null }` shape — a real bug this fixes: this route used to catch every
 * non-`ApiUnauthenticatedError` the same way, so a brief backend outage
 * made every signed-in user's session look exactly like a real logout
 * (their actual `td_session` cookie and Keycloak login were completely
 * fine) — reported live as "it loads and takes me back to login" on every
 * page view during the outage window. A `502` here (not `200`) lets
 * `useCurrentUser()`'s caller distinguish "you're not logged in" from
 * "we couldn't check right now, don't treat this as a logout".
 */
export async function GET(): Promise<NextResponse<{ user: AuthenticatedUser | null; error?: string }>> {
  try {
    const res = await fetchApi('/identity/me');
    if (res.status === 401) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    if (!res.ok) {
      console.error(`[auth/session] backend returned ${res.status} for /identity/me`);
      return NextResponse.json({ user: null, error: 'upstream_error' }, { status: 502 });
    }
    const user = (await res.json()) as AuthenticatedUser;
    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    console.error('[auth/session] failed to reach backend for current user', err);
    return NextResponse.json({ user: null, error: 'unreachable' }, { status: 502 });
  }
}
