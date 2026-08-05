import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { publicProxy } from '../../../_lib/public-proxy';

export const runtime = 'nodejs';

/**
 * GET /api/public/knowledge/articles/:slug -> GET /public/knowledge/articles/:slug
 * (PublicKnowledgeController.findBySlug). Anonymous — see
 * ../route.ts and ../../../_lib/public-proxy.ts's header comments.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  const { slug } = await params;
  return publicProxy(`/public/knowledge/articles/${encodeURIComponent(slug)}`);
}
