import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/assignment-rules/:id -> GET /assignment-rules/:id (AssignmentRulesController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/assignment-rules/${id}`);
}

/** PATCH /api/assignment-rules/:id -> PATCH /assignment-rules/:id (AssignmentRulesController.update, UpdateAssignmentRuleDto). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/assignment-rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/assignment-rules/:id -> DELETE /assignment-rules/:id (AssignmentRulesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/assignment-rules/${id}`, { method: 'DELETE' });
}
