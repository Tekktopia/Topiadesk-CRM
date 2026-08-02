import type { NextRequest } from 'next/server';
import { proxy } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const { id, roleId } = await params;
  return proxy(`/identity/users/${id}/roles/${roleId}`, { method: 'DELETE' });
}
