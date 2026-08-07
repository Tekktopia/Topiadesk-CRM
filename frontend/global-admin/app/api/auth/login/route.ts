import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildAuthorizationRequest } from '@/lib/auth/oidc';
import { writeOAuthTransaction } from '@/lib/auth/session';
import { getGlobalAdminEnv } from '@/lib/env';

export const runtime = 'nodejs';

function sanitizeReturnTo(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getGlobalAdminEnv();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  const redirectUri = new URL('/api/auth/callback', env.GLOBAL_ADMIN_URL).toString();
  const { authorizationUrl, codeVerifier, state, nonce } = await buildAuthorizationRequest(redirectUri);

  await writeOAuthTransaction({ codeVerifier, state, nonce, returnTo });

  return NextResponse.redirect(authorizationUrl);
}
