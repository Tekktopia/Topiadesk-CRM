import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/tenants/:id/subscription -> PATCH /platform/tenants/:id/subscription */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/platform/tenants/${id}/subscription`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
