import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/cross-sell/stats — whitespace KPIs plus the per-line gap table. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/cross-sell/stats${request.nextUrl.search}`);
}
