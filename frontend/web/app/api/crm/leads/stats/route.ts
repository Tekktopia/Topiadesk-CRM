import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/leads/stats — header KPI aggregates over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/leads/stats${request.nextUrl.search}`);
}
