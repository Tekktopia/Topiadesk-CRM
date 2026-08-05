import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { publicProxy } from '../../../../_lib/public-proxy';

export const runtime = 'nodejs';

/** GET /api/public/live-chat/sessions/:caseId/messages -> GET /public/live-chat/sessions/:caseId/messages (LiveChatController.listMessages). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }): Promise<NextResponse> {
  const { caseId } = await params;
  return publicProxy(`/public/live-chat/sessions/${caseId}/messages${request.nextUrl.search}`);
}

/** POST /api/public/live-chat/sessions/:caseId/messages -> POST /public/live-chat/sessions/:caseId/messages (LiveChatController.postMessage). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }): Promise<NextResponse> {
  const { caseId } = await params;
  const body = await request.text();
  return publicProxy(`/public/live-chat/sessions/${caseId}/messages`, { method: 'POST', body });
}
