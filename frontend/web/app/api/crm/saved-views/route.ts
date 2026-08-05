import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/saved-views — list, optional ?entityType= filter. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/saved-views${request.nextUrl.search}`);
}

/** POST /api/crm/saved-views — create. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/saved-views', 'POST');
}
