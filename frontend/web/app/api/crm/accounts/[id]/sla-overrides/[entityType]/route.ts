import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../_shared';

export const runtime = 'nodejs';

/** DELETE /api/crm/accounts/:id/sla-overrides/:entityType -> DELETE /crm/accounts/:id/sla-overrides/:entityType (AccountsController.removeSlaOverride). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; entityType: string }> }) {
  const { id, entityType } = await params;
  return proxyJson(`/crm/accounts/${id}/sla-overrides/${entityType}`, { method: 'DELETE' });
}
