import type { NextRequest } from 'next/server';
import { proxyStream } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/export — CSV download, same filters as the list endpoint. */
export async function GET(request: NextRequest) {
  return proxyStream(`/claims/export${request.nextUrl.search}`);
}
