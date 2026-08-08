import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../../_lib/proxy';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyWithBody(request, `/integrations/connectors/${id}`, 'PATCH');
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/integrations/connectors/${id}`, { method: 'DELETE' });
}
