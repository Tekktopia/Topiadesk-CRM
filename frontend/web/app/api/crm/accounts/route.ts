import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts — list, filters (status/industryId/riskRating/ownerId/q/take/skip) forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/accounts${request.nextUrl.search}`);
}

/** POST /api/crm/accounts — create. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/accounts', 'POST');
}
