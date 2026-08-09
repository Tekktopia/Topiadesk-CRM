import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/business-rules/:id -> GET /business-rules/:id (BusinessRulesController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/business-rules/${id}`);
}

/** PATCH /api/business-rules/:id -> PATCH /business-rules/:id (BusinessRulesController.update, UpdateBusinessRuleDto). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/business-rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/business-rules/:id -> DELETE /business-rules/:id (BusinessRulesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/business-rules/${id}`, { method: 'DELETE' });
}
