import type { NextRequest } from 'next/server';
import { proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/cross-sell — whitespace per client. Forwards the whole query string. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/cross-sell${request.nextUrl.search}`);
}
