import type { NextRequest } from 'next/server';
import { proxy } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; permissionId: string }> },
) {
  const { id, permissionId } = await params;
  return proxy(`/identity/roles/${id}/permissions/${permissionId}`, { method: 'DELETE' });
}
