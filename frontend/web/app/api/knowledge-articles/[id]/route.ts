import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/knowledge-articles/:id -> GET /knowledge/articles/:id
 * (KnowledgeArticlesController.findOne) — also fire-and-forget increments
 * the article's view counter server-side (recordView()), same as visiting
 * the backend route directly. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/articles/${id}`);
}
