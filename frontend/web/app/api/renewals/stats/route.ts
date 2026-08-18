import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/renewals/stats — board KPIs over the same filter as the list. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/renewals/stats${request.nextUrl.search}`);
}
