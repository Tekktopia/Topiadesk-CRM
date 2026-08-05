import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/:id/comments -> GET /claims/:id/comments (ClaimsController.listComments). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/claims/${id}/comments`);
}

/** POST /api/claims/:id/comments -> POST /claims/:id/comments (ClaimsController.addComment, CreateCommentDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/claims/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
