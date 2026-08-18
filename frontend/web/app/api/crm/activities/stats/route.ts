import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/activities/stats — team-activity KPIs over the same filter as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/activities/stats${request.nextUrl.search}`);
}
