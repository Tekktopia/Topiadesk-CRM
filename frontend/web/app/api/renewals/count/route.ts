import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/renewals/count — real total for the current filter, past the page cap. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/renewals/count${request.nextUrl.search}`);
}
