import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/auth/api-keys/:id -> DELETE /identity/me/api-keys/:id (ApiKeysController.revoke). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/identity/me/api-keys/${id}`, { method: 'DELETE' });
}
