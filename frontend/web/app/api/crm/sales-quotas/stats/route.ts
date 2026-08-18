import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/sales-quotas/stats — header KPIs over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/sales-quotas/stats${request.nextUrl.search}`);
}
