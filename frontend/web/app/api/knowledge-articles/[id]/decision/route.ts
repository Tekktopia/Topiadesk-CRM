import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/knowledge-articles/:id/decision -> POST /knowledge/articles/:id/decision
 * (KnowledgeArticlesController.decideApproval) — the maker-checker "decide"
 * action for the PENDING KNOWLEDGE_ARTICLE_PUBLISH approval. APPROVED
 * publishes the article; REJECTED returns it to DRAFT. Pure passthrough so
 * a 403 (segregation of duties — the decider is also the requester, or
 * lacks approval:write) reaches the client with its message intact, same
 * pattern as app/api/policies/[id]/versions/[versionId]/decision/route.ts. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/knowledge/articles/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
