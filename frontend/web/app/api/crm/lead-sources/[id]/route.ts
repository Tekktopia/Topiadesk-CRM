import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/lead-sources/${id}`);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/lead-sources/${id}`, 'PATCH');
}

/** Hard delete, blocked (409) if any Lead still references this source's code — see lead-sources.controller.ts. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/lead-sources/${id}`, { method: 'DELETE' });
}
