import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/knowledge-articles/:id/archive -> POST /knowledge/articles/:id/archive
 * (KnowledgeArticlesController.archive) — PUBLISHED -> ARCHIVED, terminal. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/articles/${id}/archive`, { method: 'POST' });
}
