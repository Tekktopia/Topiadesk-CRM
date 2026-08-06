import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/portal/auth/request-link -> POST /portal/auth/request-link
 * (PortalAuthController.requestLink) — no portal session exists yet at this
 * point, so this deliberately does NOT use fetchPortalApi()/portalProxyJson
 * (both require a session cookie). Same shape as
 * app/api/surveys/responses/[id]/submit/route.ts for the same reason: the
 * caller has no credential yet, only an email address to submit.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = getWebEnv();
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  const body = await request.text();

  try {
    const res = await fetch(`${apiBaseUrl}/portal/auth/request-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text.length > 0 ? text : null, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[portal proxy] POST /portal/auth/request-link failed', err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
