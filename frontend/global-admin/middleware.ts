import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { OAUTH_TXN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { decryptPayload } from '@/lib/auth/crypto';
import type { SessionCookiePayload } from '@/lib/auth/types';
import { getGlobalAdminEnv } from '@/lib/env';

/**
 * Route guard — direct copy of frontend/web/middleware.ts's approach (see
 * that file's header comment for the full reasoning: Edge-runtime cookie
 * presence/validity check only, no token refresh here). Every route in
 * this app requires a session except `/api/auth/**` itself.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    const env = getGlobalAdminEnv();
    const envelope = await decryptPayload<SessionCookiePayload>(sessionCookie, env.GLOBAL_ADMIN_SESSION_SECRET);
    if (envelope?.sessionId) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL('/api/auth/login', request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('returnTo', returnTo);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(OAUTH_TXN_COOKIE_NAME);
  return response;
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)'],
};
