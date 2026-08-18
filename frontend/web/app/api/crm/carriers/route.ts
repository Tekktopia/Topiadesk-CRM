import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/**
 * Forwards the query string — this route previously called
 * `proxyJson('/crm/carriers')` with no search params, so every filter the
 * page sent (q/carrierType/panelStatus/take) was silently dropped and the
 * API always returned the unfiltered list. Caught by asserting the API's own
 * response rather than trusting the table to look right.
 */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/carriers${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/carriers', 'POST');
}
