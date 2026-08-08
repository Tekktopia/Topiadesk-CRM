import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyWithBody(request, `/identity/scim-tokens/${id}`, 'PATCH');
}
