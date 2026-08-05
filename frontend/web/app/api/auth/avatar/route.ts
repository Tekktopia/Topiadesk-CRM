import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson, proxyMultipart, proxyStream } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/auth/avatar -> GET /identity/me/avatar (IdentityController.getMyAvatar) — streamed, not proxyJson (binary image body). */
export async function GET(): Promise<NextResponse> {
  return proxyStream('/identity/me/avatar');
}

/** POST /api/auth/avatar -> POST /identity/me/avatar (IdentityController.uploadMyAvatar, multipart field "file"). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyMultipart('/identity/me/avatar', request);
}

/** DELETE /api/auth/avatar -> DELETE /identity/me/avatar (IdentityController.deleteMyAvatar). */
export async function DELETE(): Promise<NextResponse> {
  return proxyJson('/identity/me/avatar', { method: 'DELETE' });
}
