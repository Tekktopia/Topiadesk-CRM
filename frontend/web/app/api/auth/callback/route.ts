import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/auth/oidc';
import { clearOAuthTransaction, readOAuthTransaction, writeSession } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';

export const runtime = 'nodejs';

/**
 * GET /api/auth/callback — Keycloak redirects here with `?code=...&state=...`
 * after a successful login (+ MFA, if the realm requires it). Exchanges the
 * code for tokens using the PKCE code_verifier stashed by /login, then sets
 * the encrypted `td_session` cookie and redirects back to the originally
 * requested page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Origin comes from the request's own Host header, not fixed env.APP_URL
  // — callback is hit on whatever subdomain /login redirected from, and
  // the redirect_uri sent to Keycloak's token endpoint must exactly match
  // the one used in the original authorization request (built the same
  // way in /api/auth/login) or Keycloak rejects the exchange. Trusting
  // Host here carries the same safety reasoning as login/route.ts:
  // Keycloak's own per-realm client redirectUris allowlist is the actual
  // enforcement boundary, not this code's origin construction.
  const host = request.headers.get('host') ?? '';
  const origin = `https://${host}`;
  const loginUrl = new URL('/api/auth/login', origin);

  const txn = await readOAuthTransaction();
  await clearOAuthTransaction();

  if (!txn) {
    // Expired (>5 min) or missing transaction cookie — most likely the
    // user opened the Keycloak login page twice, or came back stale.
    return NextResponse.redirect(loginUrl);
  }

  try {
    // openid-client's authorizationCodeGrant needs a real `URL` instance (it
    // does `instanceof URL` — request.nextUrl is Next.js's NextURL wrapper,
    // which fails that check) AND derives the `redirect_uri` it sends to the
    // token endpoint from this URL's origin+pathname (stripping the query
    // string) — see the origin derivation above for why it comes from the
    // request's own Host rather than a fixed env var, while the real
    // path/query (code, state, session_state, iss) comes from the actual
    // incoming request.
    const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, origin);
    const tokens = await exchangeCodeForTokens(txn.realm, currentUrl, {
      codeVerifier: txn.codeVerifier,
      state: txn.state,
      nonce: txn.nonce,
    });

    const claims = tokens.claims();
    if (!claims?.sub || !tokens.refresh_token || !tokens.id_token) {
      throw new Error('Token response missing required fields (sub/refresh_token/id_token)');
    }

    const now = Math.floor(Date.now() / 1000);
    const session: SessionPayload = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      accessTokenExpiresAt: now + (tokens.expiresIn() ?? 60),
      // Keycloak's refresh token lifetime is realm-configured
      // (SSO Session Max by default) and not returned in the token
      // response; 8h is a conservative fallback bound — the refresh grant
      // itself is always the source of whether it's still valid.
      refreshTokenExpiresAt: now + 60 * 60 * 8,
      subject: claims.sub,
      realm: txn.realm,
    };
    await writeSession(session);

    return NextResponse.redirect(new URL(txn.returnTo, origin));
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err);
    return NextResponse.redirect(loginUrl);
  }
}
