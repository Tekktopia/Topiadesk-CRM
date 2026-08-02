import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/contacts?accountId=... or ?carrierId=... */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/contacts${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/contacts', 'POST');
}
