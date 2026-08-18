import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts/stats — header aggregates over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/accounts/stats${request.nextUrl.search}`);
}
