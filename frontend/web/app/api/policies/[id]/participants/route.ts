import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/participants -> GET /policies/:policyId/participants (PolicyParticipantController.list). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/participants`);
}

/** POST /api/policies/:id/participants -> POST /policies/:policyId/participants (PolicyParticipantController.create). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
