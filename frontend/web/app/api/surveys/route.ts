import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/surveys -> GET /surveys (SurveysController.list) — filters
 * (type/isActive) forwarded as-is. ALL-scope-only resource: a caller
 * without survey:read (e.g. ACCOUNT_HANDLER/broker) gets a 403 from the
 * backend, forwarded through unchanged. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/surveys${request.nextUrl.search}`);
}

/** POST /api/surveys -> POST /surveys (SurveysController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
