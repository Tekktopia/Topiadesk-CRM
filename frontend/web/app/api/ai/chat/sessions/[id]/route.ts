import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/ai/chat/sessions/:id -> DELETE /ai/chat/sessions/:id (AiChatController.deleteSession). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/ai/chat/sessions/${id}`, { method: 'DELETE' });
}
