import type { NextRequest } from 'next/server';
import { proxyJson } from '../crm/_shared';

export const runtime = 'nodejs';

/** GET /api/search?q=...&limit=... — global ⌘K search, fans out across every entity type server-side. */
export async function GET(request: NextRequest) {
  return proxyJson(`/search${request.nextUrl.search}`);
}
