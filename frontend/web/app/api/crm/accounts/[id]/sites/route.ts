import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/accounts/${id}/sites`);
}

/** POST /api/crm/accounts/:id/sites -> POST /crm/accounts/:id/sites (SitesController.create). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/crm/accounts/${id}/sites`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
