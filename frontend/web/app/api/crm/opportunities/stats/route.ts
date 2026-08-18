import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/opportunities/stats — currency-normalized pipeline aggregates for the same filter set. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/opportunities/stats${request.nextUrl.search}`);
}
