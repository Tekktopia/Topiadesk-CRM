import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/stats — claims-desk aggregates over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/claims/stats${request.nextUrl.search}`);
}
