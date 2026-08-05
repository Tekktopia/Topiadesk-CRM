import type { NextResponse } from 'next/server';
import { publicProxy } from '../../_lib/public-proxy';

export const runtime = 'nodejs';

/**
 * GET /api/public/knowledge/categories -> GET /public/knowledge/categories
 * (PublicKnowledgeController.listCategories). Anonymous — see
 * ../articles/route.ts and ../_lib/public-proxy.ts's header comments.
 */
export async function GET(): Promise<NextResponse> {
  return publicProxy('/public/knowledge/categories');
}
