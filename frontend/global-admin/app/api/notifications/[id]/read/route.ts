import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/notifications/:id/read -> PATCH /platform/notifications/:id/read */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/platform/notifications/${id}/read`, { method: 'PATCH' });
}
