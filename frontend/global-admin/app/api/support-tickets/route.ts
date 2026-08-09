import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/support-tickets[?tenantId=&status=] -> GET /platform/support-tickets */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const qs = request.nextUrl.search;
  return proxyJson(`/platform/support-tickets${qs}`);
}
