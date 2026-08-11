import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/accounts/:id/group-rollup -> GET /crm/accounts/:id/group-rollup (AccountsController.groupRollup). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/accounts/${id}/group-rollup`);
}
