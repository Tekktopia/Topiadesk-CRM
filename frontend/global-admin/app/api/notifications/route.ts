import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/notifications[?unreadOnly=true&limit=] -> GET /platform/notifications */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/platform/notifications${request.nextUrl.search}`);
}
