import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/ai/chat/sessions/:id/messages -> GET /ai/chat/sessions/:id/messages (AiChatController.getMessages). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/ai/chat/sessions/${id}/messages`);
}

/**
 * POST /api/ai/chat/sessions/:id/messages -> POST /ai/chat/sessions/:id/messages
 * (AiChatController.sendMessage) — this is the one that actually calls
 * Anthropic (with a multi-round tool-use loop), so it can take a few
 * seconds; no special handling needed here beyond the normal proxy, Next's
 * default Route Handler timeout is generous enough.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/ai/chat/sessions/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
