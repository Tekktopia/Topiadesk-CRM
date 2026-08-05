import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { publicProxy } from '../../_lib/public-proxy';

export const runtime = 'nodejs';

/**
 * GET /api/public/knowledge/articles -> GET /public/knowledge/articles
 * (PublicKnowledgeController.list). Anonymous — no session cookie, no
 * Authorization header (see ../../_lib/public-proxy.ts's header comment).
 * Query string (q/categoryId/take/skip) forwarded as-is; the backend
 * hardcodes `status: 'PUBLISHED', visibility: 'CUSTOMER'` itself and
 * ignores/rejects any attempt to override that from here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return publicProxy(`/public/knowledge/articles${request.nextUrl.search}`);
}
