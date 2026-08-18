import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/loyalty-accounts/stats — programme KPIs over the same filter set as the list. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/loyalty-accounts/stats${request.nextUrl.search}`);
}
