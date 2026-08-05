import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts/check-duplicates?name=&email=&phone= — EXACT/STRONG/POSSIBLE tiered matches. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/accounts/check-duplicates${request.nextUrl.search}`);
}
