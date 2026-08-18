import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyStream } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/renewals/export — CSV of the whole filtered book, for a renewals meeting. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyStream(`/renewals/export${request.nextUrl.search}`);
}
