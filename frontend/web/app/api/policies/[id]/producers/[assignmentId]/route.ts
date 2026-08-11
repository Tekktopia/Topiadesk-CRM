import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/policies/:id/producers/:assignmentId -> DELETE /policies/:policyId/producers/:assignmentId
 * (PolicyProducerAssignmentController.remove) — removes a producer from this policy's commission-split roster. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
): Promise<NextResponse> {
  const { id, assignmentId } = await params;
  return proxyJson(`/policies/${id}/producers/${assignmentId}`, { method: 'DELETE' });
}
