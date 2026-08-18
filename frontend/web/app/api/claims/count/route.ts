import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/count — real total for the current filter set (list() caps `take`). */
export async function GET(request: NextRequest) {
  return proxyJson(`/claims/count${request.nextUrl.search}`);
}
