import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { buildLogoutUrl } from '@/lib/auth/oidc';
import { clearSession, readSession } from '@/lib/auth/session';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/auth/logout — clears the local session cookie, then redirects
 * through Keycloak's end-session endpoint (RP-Initiated Logout) so the
 * user's Keycloak SSO session is actually terminated too — clearing only
 * our cookie would leave them silently re-authenticated on the next login
 * attempt via Keycloak's existing browser SSO session.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readSession();
  await clearSession();

  const env = getWebEnv();
  // The current request's own Host, not the fixed env.APP_URL — a tenant
  // subdomain user logging out should land back on their own subdomain,
  // not get bounced to app.<domain>. Same reasoning as login/callback's
  // origin derivation.
  const host = request.headers.get('host');
  const returnOrigin = host ? `https://${host}` : env.APP_URL;

  if (!session?.idToken) {
    return NextResponse.redirect(returnOrigin);
  }

  try {
    const logoutUrl = await buildLogoutUrl(session.realm, session.idToken, returnOrigin);
    return NextResponse.redirect(logoutUrl);
  } catch (err) {
    console.error('[auth/logout] failed to build Keycloak end-session URL', err);
    return NextResponse.redirect(returnOrigin);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
