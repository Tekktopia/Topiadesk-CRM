import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/knowledge-articles -> GET /knowledge/articles
 * (KnowledgeArticlesController.list) — filters (categoryId/status/locale/
 * visibility/q) forwarded as-is; `q` is a real backend ILIKE search on
 * title (KnowledgeArticlesService.list()), not a client-side filter. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/knowledge/articles${request.nextUrl.search}`);
}

/** POST /api/knowledge-articles -> POST /knowledge/articles
 * (KnowledgeArticlesController.create) — writes the DRAFT article row and
 * its version-1 row together. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/knowledge/articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
