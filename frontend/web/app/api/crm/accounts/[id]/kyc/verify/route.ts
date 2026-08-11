import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/accounts/:id/kyc/verify -> POST /crm/accounts/:id/kyc/verify (AccountsController.verifyKyc). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/accounts/${id}/kyc/verify`, { method: 'POST' });
}
