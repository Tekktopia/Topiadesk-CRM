import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/knowledge-articles/:id/feedback -> POST /knowledge/articles/:id/feedback
 * (KnowledgeArticlesController.feedback) — upserted on (articleId, the
 * calling user), i.e. "was this helpful" thumbs up/down. Any authenticated
 * user may call this (no @RequirePermission on the backend route). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/knowledge/articles/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
