import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/consent-records?contactId=... -> GET /crm/consent-records (full history). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/consent-records${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/consent-records', 'POST');
}
