import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';
import { writePortalSessionToken } from '@/lib/portal-auth/session';

export const runtime = 'nodejs';

/**
 * POST /api/portal/auth/consume -> POST /portal/auth/consume
 * (PortalAuthController.consume). Same no-session-yet reasoning as
 * request-link/route.ts. On success, the backend's `sessionToken` is
 * written straight into the HttpOnly `portal_session` cookie server-side
 * and deliberately stripped from the JSON returned to the browser — it
 * should never sit in a variable reachable by client JS, same reasoning
 * `lib/auth/session.ts`'s internal session keeps its tokens server-only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = getWebEnv();
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  const body = await request.text();

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/portal/auth/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[portal proxy] POST /portal/auth/consume failed', err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!res.ok || !parsed || typeof parsed !== 'object' || !('sessionToken' in parsed)) {
    return NextResponse.json(parsed ?? { message: 'Sign-in failed' }, { status: res.status });
  }

  const { sessionToken, contactName, accountName } = parsed as { sessionToken: string; contactName: string; accountName: string };
  await writePortalSessionToken(sessionToken);
  return NextResponse.json({ contactName, accountName }, { status: 200 });
}
