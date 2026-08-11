import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/data-subject-requests -> GET /crm/data-subject-requests (filters: contactId/status). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/data-subject-requests${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/data-subject-requests', 'POST');
}
