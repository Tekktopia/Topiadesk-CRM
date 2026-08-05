import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/knowledge-categories -> GET /knowledge/categories
 * (KnowledgeCategoriesController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/knowledge/categories');
}

/** POST /api/knowledge-categories -> POST /knowledge/categories
 * (KnowledgeCategoriesController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/knowledge/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
