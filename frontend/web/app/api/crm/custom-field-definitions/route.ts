import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/custom-field-definitions — list, optional ?entityType= filter. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/custom-field-definitions${request.nextUrl.search}`);
}

/** POST /api/crm/custom-field-definitions — create. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/custom-field-definitions', 'POST');
}
