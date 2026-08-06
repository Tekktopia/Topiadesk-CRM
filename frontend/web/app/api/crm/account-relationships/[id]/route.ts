import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** PATCH /api/crm/account-relationships/:id -> PATCH /crm/account-relationships/:id (AccountRelationshipsController.update). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/crm/account-relationships/${id}`, { method: 'PATCH', body, headers: { 'Content-Type': 'application/json' } });
}

/** DELETE /api/crm/account-relationships/:id -> DELETE /crm/account-relationships/:id (AccountRelationshipsController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/account-relationships/${id}`, { method: 'DELETE' });
}
