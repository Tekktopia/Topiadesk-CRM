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
  const txn = await readOAuthTransaction();
  await clearOAuthTransaction();

  if (!txn) {
    // Expired (>5 min) or missing transaction cookie — most likely the
    // user opened the Keycloak login page twice, or came back stale.
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(request.nextUrl, {
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

    return NextResponse.redirect(new URL(txn.returnTo, request.url));
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err);
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }
}
