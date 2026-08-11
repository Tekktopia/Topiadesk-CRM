import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/policies/:id/coverages/:coverageId -> PATCH /policies/:policyId/coverages/:id (PolicyCoverageController.update). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; coverageId: string }> },
): Promise<NextResponse> {
  const { id, coverageId } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/coverages/${coverageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** DELETE /api/policies/:id/coverages/:coverageId -> DELETE /policies/:policyId/coverages/:id (PolicyCoverageController.remove). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; coverageId: string }> },
): Promise<NextResponse> {
  const { id, coverageId } = await params;
  return proxyJson(`/policies/${id}/coverages/${coverageId}`, { method: 'DELETE' });
}
