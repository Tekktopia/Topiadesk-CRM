import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/policies/:id/participants/:participantId -> PATCH /policies/:policyId/participants/:id (PolicyParticipantController.update). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> },
): Promise<NextResponse> {
  const { id, participantId } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/participants/${participantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** DELETE /api/policies/:id/participants/:participantId -> DELETE /policies/:policyId/participants/:id (PolicyParticipantController.remove). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> },
): Promise<NextResponse> {
  const { id, participantId } = await params;
  return proxyJson(`/policies/${id}/participants/${participantId}`, { method: 'DELETE' });
}
