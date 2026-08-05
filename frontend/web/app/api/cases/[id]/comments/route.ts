import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/cases/:id/comments -> GET /cases/:id/comments (CasesController.listComments). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/cases/${id}/comments`);
}

/** POST /api/cases/:id/comments -> POST /cases/:id/comments (CasesController.addComment, CreateCommentDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
