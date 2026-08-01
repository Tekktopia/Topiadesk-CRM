import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { buildAuthorizationRequest } from '@/lib/auth/oidc';
import { writeOAuthTransaction } from '@/lib/auth/session';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/** Rejects anything but an in-app relative path — prevents an open
 * redirect via a crafted `?returnTo=https://evil.example` query param. */
function sanitizeReturnTo(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

/**
 * GET /api/auth/login — starts the Authorization Code + PKCE flow: builds
 * the Keycloak authorization URL, stashes the PKCE code_verifier/state/
 * nonce (+ where to return to) in the short-lived `td_oauth_txn` cookie,
 * and redirects the browser to Keycloak. Keycloak's own hosted login UI
 * handles credentials + MFA/TOTP (realm-configured) — nothing to build here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getWebEnv();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  const redirectUri = new URL('/api/auth/callback', env.APP_URL).toString();
  const { authorizationUrl, codeVerifier, state, nonce } = await buildAuthorizationRequest(redirectUri);

  await writeOAuthTransaction({ codeVerifier, state, nonce, returnTo });

  return NextResponse.redirect(authorizationUrl);
}
