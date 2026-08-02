import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/identity/roles/${id}`);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyWithBody(request, `/identity/roles/${id}`, 'PATCH');
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/identity/roles/${id}`, { method: 'DELETE' });
}
