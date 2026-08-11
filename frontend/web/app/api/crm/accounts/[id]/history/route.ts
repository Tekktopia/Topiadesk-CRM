import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts/:id/history -> GET /crm/accounts/:id/history (AccountsController.history). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/accounts/${id}/history`);
}
