import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/sales-quotas — list, optional ?scopeType=&userId= filters. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/sales-quotas${request.nextUrl.search}`);
}

/** POST /api/crm/sales-quotas — create. Write is gated on 'sales_quota':'write', which is ADMIN-only (see sales-quotas.controller.ts). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/sales-quotas', 'POST');
}
