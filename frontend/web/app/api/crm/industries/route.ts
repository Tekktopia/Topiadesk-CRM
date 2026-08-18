import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/industries — list/search, powers the Account form's industry picker. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/industries${request.nextUrl.search}`);
}

/** POST /api/crm/industries — create. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/industries', 'POST');
}
