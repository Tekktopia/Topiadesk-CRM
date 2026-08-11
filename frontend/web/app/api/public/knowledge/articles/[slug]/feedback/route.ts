import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { publicProxy } from '../../../../_lib/public-proxy';

export const runtime = 'nodejs';

/**
 * POST /api/public/knowledge/articles/:slug/feedback -> POST /public/knowledge/articles/:slug/feedback
 * (PublicKnowledgeController.feedback). Anonymous — see
 * ../../route.ts and ../../../../_lib/public-proxy.ts's header comments.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  const { slug } = await params;
  const body = await request.text();
  return publicProxy(`/public/knowledge/articles/${encodeURIComponent(slug)}/feedback`, { method: 'POST', body });
}
