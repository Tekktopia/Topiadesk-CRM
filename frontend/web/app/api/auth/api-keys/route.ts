import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/auth/api-keys -> GET /identity/me/api-keys (ApiKeysController.list, self-scoped). */
export async function GET() {
  return proxyJson('/identity/me/api-keys');
}

/** POST /api/auth/api-keys -> POST /identity/me/api-keys (ApiKeysController.create). */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/identity/me/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
