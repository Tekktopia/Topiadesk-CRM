import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * Semantic search over indexed entities (currently 'account' and
 * 'knowledge_article' — see indexable-entity-types.ts). Used by the Account
 * detail page's AI Insight panel to look up accounts whose indexed content
 * reads similarly to this one; results depend on what has actually been
 * indexed via POST /ai/index, so an empty result set is expected/normal,
 * not an error.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/ai/search', {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body || undefined,
  });
}
