import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/knowledge-articles/:id/versions -> GET /knowledge/articles/:id/versions
 * (KnowledgeArticlesController.listVersions) — full version history, oldest first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/articles/${id}/versions`);
}

/** POST /api/knowledge-articles/:id/versions -> POST /knowledge/articles/:id/versions
 * (KnowledgeArticlesController.addVersion) — only while the article is
 * DRAFT (backend-enforced); also used for "restore this version" from the
 * version history panel, which just re-submits an older version's
 * bodyMarkdown as a new version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/knowledge/articles/${id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
