import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { buildAuthorizationRequest } from '@/lib/auth/oidc';
import { writeOAuthTransaction } from '@/lib/auth/session';
import { realmForHost } from '@/lib/auth/tenant-realm';

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
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  // The actual Host this request arrived on, not the fixed env.APP_URL —
  // this is what makes a tenant subdomain log into its OWN realm rather
  // than always the default one. Trusting Host here is safe specifically
  // because Keycloak's own per-realm client redirectUris allowlist (see
  // keycloak-realm-provisioning.ts) is the real enforcement boundary: a
  // spoofed Host either resolves to no realm (falls back to default) or to
  // a real tenant's realm whose client only accepts THAT tenant's own
  // redirect URI regardless of what this code claims.
  const host = request.headers.get('host') ?? '';
  const realm = await realmForHost(host);
  const origin = `https://${host}`;

  const redirectUri = new URL('/api/auth/callback', origin).toString();
  const { authorizationUrl, codeVerifier, state, nonce } = await buildAuthorizationRequest(realm, redirectUri);

  await writeOAuthTransaction({ codeVerifier, state, nonce, returnTo, realm });

  return NextResponse.redirect(authorizationUrl);
}
