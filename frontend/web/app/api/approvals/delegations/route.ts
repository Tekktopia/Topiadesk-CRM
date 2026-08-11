import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/approvals/delegations -> GET /approvals/delegations (ApprovalDelegationsController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/approvals/delegations');
}

/** POST /api/approvals/delegations -> POST /approvals/delegations (ApprovalDelegationsController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/approvals/delegations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
