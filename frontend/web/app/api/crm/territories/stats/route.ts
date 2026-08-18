import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/territories/stats — including how many clients sit in nobody's book. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/territories/stats${request.nextUrl.search}`);
}
