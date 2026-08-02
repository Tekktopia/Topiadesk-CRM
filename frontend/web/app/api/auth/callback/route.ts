import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/auth/oidc';
import { clearOAuthTransaction, readOAuthTransaction, writeSession } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/auth/callback — Keycloak redirects here with `?code=...&state=...`
 * after a successful login (+ MFA, if the realm requires it). Exchanges the
 * code for tokens using the PKCE code_verifier stashed by /login, then sets
 * the encrypted `td_session` cookie and redirects back to the originally
 * requested page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getWebEnv();
  // Redirect targets are built from env.APP_URL (the trusted, configured
  // origin) rather than request.url/request.nextUrl's origin — besides
  // avoiding any Host-header-trust concerns, request.url's origin can't be
  // relied on to reflect the public-facing host behind a reverse proxy.
  const loginUrl = new URL('/api/auth/login', env.APP_URL);

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
    // string) — that must exactly match the redirect_uri used in the
    // original authorization request (built from env.APP_URL in
    // /api/auth/login) or Keycloak rejects the exchange. request.url's
    // origin isn't reliably the public-facing one behind Traefik, so the
    // origin comes from env.APP_URL while the real path/query (code, state,
    // session_state, iss) comes from the actual incoming request.
    const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, env.APP_URL);
    const tokens = await exchangeCodeForTokens(currentUrl, {
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
      // itself is always the source of truth for whether it's still valid.
      refreshTokenExpiresAt: now + 60 * 60 * 8,
      subject: claims.sub,
    };
    await writeSession(session);

    return NextResponse.redirect(new URL(txn.returnTo, env.APP_URL));
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err);
    return NextResponse.redirect(loginUrl);
  }
}
