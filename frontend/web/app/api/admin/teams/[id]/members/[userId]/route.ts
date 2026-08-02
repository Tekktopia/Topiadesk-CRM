import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return proxyWithBody(request, `/identity/teams/${id}/members/${userId}`, 'PATCH');
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;
  return proxy(`/identity/teams/${id}/members/${userId}`, { method: 'DELETE' });
}
