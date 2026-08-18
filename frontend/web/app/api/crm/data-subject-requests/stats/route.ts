import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/data-subject-requests/stats — compliance-queue KPIs over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/data-subject-requests/stats${request.nextUrl.search}`);
}
