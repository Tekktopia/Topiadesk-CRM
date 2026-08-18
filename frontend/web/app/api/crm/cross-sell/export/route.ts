import type { NextRequest } from 'next/server';
import { proxyFile } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/cross-sell/export — the call list a producer works from. */
export async function GET(request: NextRequest) {
  return proxyFile(`/crm/cross-sell/export${request.nextUrl.search}`);
}
