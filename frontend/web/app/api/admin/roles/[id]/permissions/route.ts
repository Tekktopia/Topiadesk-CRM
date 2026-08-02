import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/roles/:id/permissions — body: { permissionId: string }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyWithBody(request, `/identity/roles/${id}/permissions`, 'POST');
}
