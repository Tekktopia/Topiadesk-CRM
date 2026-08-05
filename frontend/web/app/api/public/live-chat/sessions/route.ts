import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { publicProxy } from '../../_lib/public-proxy';

export const runtime = 'nodejs';

/** POST /api/public/live-chat/sessions -> POST /public/live-chat/sessions (LiveChatController.startSession). Anonymous — no session cookie. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return publicProxy('/public/live-chat/sessions', { method: 'POST', body });
}
