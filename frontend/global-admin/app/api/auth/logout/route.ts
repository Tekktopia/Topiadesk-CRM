import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildLogoutUrl } from '@/lib/auth/oidc';
import { clearSession, readSession } from '@/lib/auth/session';
import { getGlobalAdminEnv } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await readSession();
  await clearSession();

  const env = getGlobalAdminEnv();
  if (!session?.idToken) {
    return NextResponse.redirect(env.GLOBAL_ADMIN_URL);
  }

  try {
    const logoutUrl = await buildLogoutUrl(session.idToken, env.GLOBAL_ADMIN_URL);
    return NextResponse.redirect(logoutUrl);
  } catch (err) {
    console.error('[auth/logout] failed to build Keycloak end-session URL', err);
    return NextResponse.redirect(env.GLOBAL_ADMIN_URL);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
