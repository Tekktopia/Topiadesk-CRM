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
 * Returns `{ user: null }` (200, not 401) when unauthenticated — this is a
 * "tell me who's logged in, if anyone" endpoint the client can poll safely
 * without treating "no session" as an error state.
 */
export async function GET(): Promise<NextResponse<{ user: AuthenticatedUser | null }>> {
  try {
    const res = await fetchApi('/identity/me');
    if (!res.ok) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    const user = (await res.json()) as AuthenticatedUser;
    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    console.error('[auth/session] failed to fetch current user', err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
