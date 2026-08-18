import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/activities/count — real total past the page cap. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/activities/count${request.nextUrl.search}`);
}
