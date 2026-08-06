import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWebEnv } from '../env';
import { PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_MAX_AGE_SECONDS } from './constants';

/**
 * Cookie session for the customer portal — deliberately simpler than
 * `lib/auth/session.ts`'s internal-staff session: one HttpOnly cookie
 * holding the portal session token itself, no encrypted envelope + Redis
 * indirection. That machinery exists internally because three Keycloak
 * JWTs together exceed a cookie's ~4096-byte limit; a single portal session
 * token has no such problem, and the backend (PortalSession.tokenHash)
 * already treats it as a credential hashed at rest, same as a bearer token.
 * No refresh either — PortalSession is a flat 7-day TTL with no rotation
 * (portal-auth.controller.ts); once it expires, the customer requests a new
 * magic link rather than silently refreshing.
 */
function cookieOptions() {
  const env = getWebEnv();
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
    ...(env.WEB_COOKIE_DOMAIN ? { domain: env.WEB_COOKIE_DOMAIN } : {}),
  };
}

export async function readPortalSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(PORTAL_SESSION_COOKIE_NAME)?.value ?? null;
}

/** Route Handler only (cookie mutation is not allowed during a Server Component render). */
export async function writePortalSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE_NAME, token, cookieOptions());
}

export async function clearPortalSession(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_SESSION_COOKIE_NAME);
}

/** Server Component guard for every protected /portal/* page — just checks
 * a cookie is present (cheap, Edge-safe shape), same as middleware.ts does
 * for the internal `td_session`. The actual session validity check happens
 * on the first data fetch: PortalContextMiddleware 401s a stale/expired
 * token, and app/(portal)/portal/_lib/api.ts's ApiError surfaces that as a
 * normal query error rather than this redirect handling it — a session
 * that goes stale mid-visit degrades to an in-page error state, not a
 * surprise redirect out from under an open tab. */
export async function requirePortalSession(): Promise<void> {
  const token = await readPortalSessionToken();
  if (!token) redirect('/portal/login');
}
