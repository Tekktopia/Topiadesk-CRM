import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/knowledge-categories/:id -> GET /knowledge/categories/:id
 * (KnowledgeCategoriesController.findOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/categories/${id}`);
}

/** PATCH /api/knowledge-categories/:id -> PATCH /knowledge/categories/:id
 * (KnowledgeCategoriesController.update). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/knowledge/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/knowledge-categories/:id -> DELETE /knowledge/categories/:id
 * (KnowledgeCategoriesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/knowledge/categories/${id}`, { method: 'DELETE' });
}
