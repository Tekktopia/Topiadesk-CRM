import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/policies/approval-threshold-rules/:id -> PATCH /policies/approval-threshold-rules/:id (ApprovalThresholdRulesController.update). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/approval-threshold-rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

/** DELETE /api/policies/approval-threshold-rules/:id -> DELETE /policies/approval-threshold-rules/:id (ApprovalThresholdRulesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/approval-threshold-rules/${id}`, { method: 'DELETE' });
}
