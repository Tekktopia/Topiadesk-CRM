import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/documents/:id/links -> GET /documents/:id/links
 * (DocumentsController.listLinks). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/documents/${id}/links`);
}

/** POST /api/documents/:id/links -> POST /documents/:id/links
 * (DocumentsController.createLink, `{ entityType, entityId }`) — links a
 * document to a Policy (or Account/Contact/Opportunity/Lead/Task). Used by
 * the policy detail page's "Link existing document" action and the
 * documents manager's "Link to policy" action. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/documents/${id}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
