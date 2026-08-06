import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/accounts/${id}/sla-overrides`);
}

/** PUT /api/crm/accounts/:id/sla-overrides -> PUT /crm/accounts/:id/sla-overrides (AccountsController.upsertSlaOverride). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/crm/accounts/${id}/sla-overrides`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } });
}
