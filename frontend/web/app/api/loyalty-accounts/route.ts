import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/loyalty-accounts -> GET /loyalty-accounts
 * (LoyaltyAccountsController.list) — filters: search/tier/take.
 *
 * Forwards the whole query string. This route previously hand-picked only
 * `search`, so `tier` and `take` were dropped SILENTLY — the request still
 * succeeded and returned the unfiltered list. That is the same failure mode
 * that hid broken filters on carriers, users, notifications and claims;
 * hand-picked params are only worth the risk when there is an actual reason
 * to withhold one, and there is none here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/loyalty-accounts${request.nextUrl.search}`);
}

/** POST /api/loyalty-accounts -> POST /loyalty-accounts (LoyaltyAccountsController.enroll, EnrollLoyaltyAccountDto). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/loyalty-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
