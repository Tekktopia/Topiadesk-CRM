import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id -> GET /policies/:id (PolicyController.findOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}`);
}

/**
 * PATCH /api/policies/:id -> PATCH /policies/:id (PolicyController.update).
 * Used both for plain field edits and for the direct status-transition
 * action (QUOTED->BOUND, BOUND->CANCELLED, etc.) — the backend validates
 * the move against POLICY_STATUS_TRANSITIONS and 400s an invalid one; the
 * UI additionally pre-filters options via availableVersionTypes-adjacent
 * logic so this is a belt-and-suspenders check, not the only one.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
