import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/sla-policies/:id -> GET /sla-policies/:id (SlaPoliciesController.getOne, includes targets). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/sla-policies/${id}`);
}

/** PATCH /api/sla-policies/:id -> PATCH /sla-policies/:id (SlaPoliciesController.update, UpdateSlaPolicyDto). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/sla-policies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/sla-policies/:id -> DELETE /sla-policies/:id (SlaPoliciesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/sla-policies/${id}`, { method: 'DELETE' });
}
