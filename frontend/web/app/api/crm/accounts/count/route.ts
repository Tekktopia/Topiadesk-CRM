import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts/count — real total for the current filter set (list() caps `take` for payload size). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/accounts/count${request.nextUrl.search}`);
}
