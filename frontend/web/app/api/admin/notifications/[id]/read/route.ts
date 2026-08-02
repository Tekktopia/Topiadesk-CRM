import type { NextRequest } from 'next/server';
import { proxy } from '../../../_lib/proxy';

export const runtime = 'nodejs';

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/notifications/${id}/read`, { method: 'PATCH' });
}
