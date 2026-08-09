import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/search?q=...&limit=... -> GET /platform/search?q=...&limit=... */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/platform/search${request.nextUrl.search}`);
}
