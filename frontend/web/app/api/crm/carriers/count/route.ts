import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/carriers/count — same filter set as the carriers list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/carriers/count${request.nextUrl.search}`);
}
