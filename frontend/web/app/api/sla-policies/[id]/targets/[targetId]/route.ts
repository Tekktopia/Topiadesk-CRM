import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/sla-policies/:id/targets/:targetId -> PATCH /sla-policies/:id/targets/:targetId (SlaPoliciesController.updateTarget). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
): Promise<NextResponse> {
  const { id, targetId } = await params;
  const body = await request.text();
  return proxyJson(`/sla-policies/${id}/targets/${targetId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/sla-policies/:id/targets/:targetId -> DELETE /sla-policies/:id/targets/:targetId (SlaPoliciesController.removeTarget). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
): Promise<NextResponse> {
  const { id, targetId } = await params;
  return proxyJson(`/sla-policies/${id}/targets/${targetId}`, { method: 'DELETE' });
}
