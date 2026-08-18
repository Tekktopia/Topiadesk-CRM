import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/territories — books of business. Forwards the whole query string. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/territories${request.nextUrl.search}`);
}

/** POST /api/crm/territories — create a book (ALL-scope 'territory':'write'). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/territories', 'POST');
}
