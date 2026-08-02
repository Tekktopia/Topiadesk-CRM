import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/versions -> GET /policies/:policyId/versions
 * (PolicyVersionController.list) — full version history with derived
 * approvalStatus/applied flags. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/versions`);
}

/**
 * POST /api/policies/:id/versions -> POST /policies/:policyId/versions
 * (PolicyVersionController.create). ENDORSEMENT/CANCELLATION versions
 * create a PENDING Approval instead of applying immediately — the response
 * carries `approvalStatus`/`applied` so the UI can show "submitted for
 * approval" instead of implying the change already took effect.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
