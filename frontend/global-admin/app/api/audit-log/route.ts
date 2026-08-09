import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/audit-log[?entityType=&entityId=&limit=] -> GET /platform/audit-log */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const qs = request.nextUrl.search;
  return proxyJson(`/platform/audit-log${qs}`);
}
