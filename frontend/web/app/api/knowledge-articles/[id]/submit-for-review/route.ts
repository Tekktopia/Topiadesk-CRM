import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/knowledge-articles/:id/submit-for-review ->
 * POST /knowledge/articles/:id/submit-for-review
 * (KnowledgeArticlesController.submitForReview) — DRAFT -> IN_REVIEW, and
 * creates the PENDING Approval (entityType KNOWLEDGE_ARTICLE_PUBLISH) that
 * gates publishing. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/articles/${id}/submit-for-review`, { method: 'POST' });
}
