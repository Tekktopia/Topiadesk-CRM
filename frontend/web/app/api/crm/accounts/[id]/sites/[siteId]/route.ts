import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../../_shared';

export const runtime = 'nodejs';

/** PATCH /api/crm/accounts/:id/sites/:siteId -> PATCH /crm/accounts/:id/sites/:siteId (SitesController.update). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; siteId: string }> }) {
  const { id, siteId } = await params;
  const body = await request.text();
  return proxyJson(`/crm/accounts/${id}/sites/${siteId}`, { method: 'PATCH', body, headers: { 'Content-Type': 'application/json' } });
}

/** DELETE /api/crm/accounts/:id/sites/:siteId -> DELETE /crm/accounts/:id/sites/:siteId (SitesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; siteId: string }> }) {
  const { id, siteId } = await params;
  return proxyJson(`/crm/accounts/${id}/sites/${siteId}`, { method: 'DELETE' });
}
