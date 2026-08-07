import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/auth/oidc';
import { clearOAuthTransaction, readOAuthTransaction, writeSession } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { getGlobalAdminEnv } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getGlobalAdminEnv();
  const loginUrl = new URL('/api/auth/login', env.GLOBAL_ADMIN_URL);

  const txn = await readOAuthTransaction();
  await clearOAuthTransaction();

  if (!txn) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, env.GLOBAL_ADMIN_URL);
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
      refreshTokenExpiresAt: now + 60 * 60 * 8,
      subject: claims.sub,
    };
    await writeSession(session);

    return NextResponse.redirect(new URL(txn.returnTo, env.GLOBAL_ADMIN_URL));
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err);
    return NextResponse.redirect(loginUrl);
  }
}
