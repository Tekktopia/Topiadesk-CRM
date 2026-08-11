import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/producers -> GET /policies/:policyId/producers
 * (PolicyProducerAssignmentController.list) — the commission-split roster for this policy. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/producers`);
}

/** POST /api/policies/:id/producers -> POST /policies/:policyId/producers
 * (PolicyProducerAssignmentController.create) — assigns a producer with a commission split % to this policy. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/producers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
