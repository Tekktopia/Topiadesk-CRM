import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/policies/:id/signature-requests/:requestId/void -> POST /policies/:id/signature-requests/:requestId/void. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  return proxyJson(`/policies/${id}/signature-requests/${requestId}/void`, { method: 'POST' });
}
