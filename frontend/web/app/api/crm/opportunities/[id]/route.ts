import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/opportunities/${id}`);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/opportunities/${id}`, 'PATCH');
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/opportunities/${id}`, { method: 'DELETE' });
}
