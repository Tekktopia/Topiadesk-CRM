import type { NextRequest } from 'next/server';
import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/identity/field-permissions/${id}`, { method: 'DELETE' });
}
