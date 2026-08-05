import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/auth/presence -> PATCH /identity/me/presence (IdentityController.updateMyPresence, self-service). */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/identity/me/presence', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
