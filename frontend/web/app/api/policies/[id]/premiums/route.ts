import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/premiums -> GET /policies/:policyId/premiums
 * (PolicyPremiumController.list), ordered by dueDate asc. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/premiums`);
}

/** POST /api/policies/:id/premiums -> POST /policies/:policyId/premiums
 * (PolicyPremiumController.create) — records a new installment/premium
 * line against the policy. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/premiums`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
