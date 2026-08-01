import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { OAUTH_TXN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { decryptPayload } from '@/lib/auth/crypto';
import type { SessionPayload } from '@/lib/auth/types';
import { getWebEnv } from '@/lib/env';

/**
 * Route guard: redirects any request without a valid `td_session` cookie
 * to /api/auth/login (preserving the originally-requested path so login
 * can return there). Runs on the Edge runtime (Next.js middleware
 * default) — deliberately kept dependency-light: it only decrypts the
 * session cookie (via `lib/auth/crypto.ts`, which is Web-Crypto-based and
 * has no Node-only or `next/headers` dependency) to check it's present and
 * not tampered with/expired. It does NOT perform token refresh here —
 * refresh requires `openid-client` talking to Keycloak's token endpoint,
 * which belongs in Node-runtime Route Handlers/Server Actions (see
 * `lib/auth/session.ts#getValidAccessToken`, used by
 * `lib/api/server-fetch.ts`), not in every Edge-runtime middleware
 * invocation. A session whose access token has expired still passes this
 * gate (it has a cookie); the actual API call refreshes it lazily at the
 * point of use, or the API returns 401 and the caller re-authenticates.
 *
 * `/api/auth/**` is excluded from the matcher below so /login, /callback,
 * /logout, and /session can run without recursively guarding themselves.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    const env = getWebEnv();
    const session = await decryptPayload<SessionPayload>(sessionCookie, env.WEB_SESSION_SECRET);
    if (session) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL('/api/auth/login', request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('returnTo', returnTo);

  const response = NextResponse.redirect(loginUrl);
  // Clean up a stale/tampered cookie so it doesn't keep failing decryption
  // on every subsequent request.
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(OAUTH_TXN_COOKIE_NAME);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth/* (login/callback/logout/session — must stay public)
     * - Next internals (_next/static, _next/image)
     * - common static file extensions
     * - favicon.ico
     */
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
