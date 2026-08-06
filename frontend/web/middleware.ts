import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { OAUTH_TXN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { decryptPayload } from '@/lib/auth/crypto';
import type { SessionCookiePayload } from '@/lib/auth/types';
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
 *
 * `/survey-respond/**` and `/api/surveys/responses/**` are also excluded —
 * the one public, unauthenticated surface in app/(knowledge)/**. An external
 * contact clicking an emailed/SMS'd survey link has no `td_session` cookie
 * at all; without this exclusion this middleware would redirect them to
 * /api/auth/login before survey-respond/[token]/page.tsx or its BFF route
 * (app/api/surveys/responses/[id]/submit/route.ts) ever ran. Security for
 * that surface is "possession of respondToken", verified server-side by the
 * backend (constant-time compare in SurveysService.submitResponse()), not a
 * session cookie — see that BFF route's header comment.
 *
 * `/api/public/**` is excluded the same way — the live chat widget's own
 * fetch calls (app/api/public/live-chat/**) simulate what an anonymous
 * website visitor's browser would send, with no TopiaDesk session cookie
 * at all, even though the demo page hosting the widget
 * (app/(dashboard)/widget-demo/) stays behind the normal auth gate (it's an
 * internal tool for seeing the flow work, not a page real external
 * customers are meant to load). Security for the widget's own endpoints is
 * a signed session token (an HMAC of the chat's case id), not this cookie
 * — see live-chat.controller.ts's header comment.
 *
 * `/kb/**` is excluded the same way as `/survey-respond/**` above — the
 * public knowledge base portal (app/(knowledge)/kb/**), reached by an
 * anonymous external visitor (e.g. a customer looking up a policy FAQ) with
 * no `td_session` cookie at all. Its data comes through `/api/public/**`
 * (already excluded, see above), which forwards to
 * public-knowledge.controller.ts — a route with no session/token gate of
 * its own, since a CUSTOMER-visibility PUBLISHED article isn't
 * per-recipient-secret the way an unsubscribe link or survey response is.
 *
 * `/portal/**` and `/api/portal/**` are excluded the same way — the
 * customer self-service portal (app/(portal)/portal/**), reached by an
 * external Contact with no `td_session` cookie at all. It has its own,
 * completely separate auth model (a `portal_session` cookie, checked by
 * each protected page itself via `lib/portal-auth/session.ts`, not by this
 * middleware) — see app/(portal)/portal/layout.tsx's header comment.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    const env = getWebEnv();
    // Only the small `{sessionId}` envelope — the real tokens live in Redis
    // and are deliberately unreachable from the Edge runtime. A valid,
    // unexpired envelope is sufficient for this gate; the actual API call
    // downstream is what resolves (and can invalidate) the stored session.
    const envelope = await decryptPayload<SessionCookiePayload>(sessionCookie, env.WEB_SESSION_SECRET);
    if (envelope?.sessionId) {
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
     * - /survey-respond/* (public survey response page) and
     *   /api/surveys/responses/* (its BFF submit route) — token-verified,
     *   not session-verified
     * - /api/public/* (live chat widget's BFF proxies, and the public
     *   knowledge base portal's BFF proxies) — anonymous, no cookie
     *   involved at all (the demo page hosting the live chat widget itself
     *   stays behind the normal auth gate)
     * - /kb/* (public knowledge base portal) — anonymous, no cookie or
     *   token involved; see the header comment above
     * - /portal/* and /api/portal/* (customer self-service portal) — its
     *   own portal_session cookie, checked at the page level, not here
     * - Next internals (_next/static, _next/image)
     * - common static file extensions
     * - favicon.ico
     */
    '/((?!api/auth|survey-respond|api/surveys/responses|api/public|kb|portal|api/portal|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
