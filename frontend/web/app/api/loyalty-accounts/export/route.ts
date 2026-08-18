import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyStream } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/loyalty-accounts/export — CSV download, same filters as the list endpoint. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyStream(`/loyalty-accounts/export${request.nextUrl.search}`);
}
