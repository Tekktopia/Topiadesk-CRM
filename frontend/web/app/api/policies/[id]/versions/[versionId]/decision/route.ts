import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/policies/:id/versions/:versionId/decision -> POST
 * /policies/:policyId/versions/:versionId/decision
 * (PolicyVersionController.decideApproval) — the maker-checker "decide"
 * action for a PENDING ENDORSEMENT/CANCELLATION approval. The backend
 * enforces segregation of duties (403 if the deciding user is also the
 * requester, matching the `approvals_requester_ne_approver` DB constraint);
 * this proxy is a pure passthrough so that 403 (and its message) reaches
 * the client for the UI to surface, rather than failing silently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> {
  const { id, versionId } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/versions/${versionId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
