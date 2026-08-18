import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/ai/chat/sessions -> POST /ai/chat/sessions (AiChatController.createSession). */
export async function POST() {
  return proxyJson('/ai/chat/sessions', { method: 'POST' });
}

/** GET /api/ai/chat/sessions -> GET /ai/chat/sessions (AiChatController.listSessions). */
export async function GET() {
  return proxyJson('/ai/chat/sessions');
}
