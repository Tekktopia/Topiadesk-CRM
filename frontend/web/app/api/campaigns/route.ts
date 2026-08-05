import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from './_shared';

export const runtime = 'nodejs';

/** GET /api/campaigns — list, filters (status/channel) forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxyJson(`/campaigns${request.nextUrl.search}`);
}

/** POST /api/campaigns — create (always lands as DRAFT; send/schedule are separate action routes). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/campaigns', 'POST');
}
