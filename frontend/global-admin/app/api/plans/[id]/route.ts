import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/plans/:id -> PATCH /platform/plans/:id (UpdatePlanDto) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/platform/plans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
