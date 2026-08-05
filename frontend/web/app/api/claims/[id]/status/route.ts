import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/claims/:id/status -> POST /claims/:id/status
 * (ClaimsController.changeStatus, ChangeClaimStatusDto) — the claim
 * lifecycle status-transition action. The backend validates the move
 * against CLAIM_STATUS_TRANSITIONS and writes a ClaimStatusHistory row;
 * the UI (claim-lifecycle-actions.tsx) pre-filters options via the
 * hand-mirrored transition map, this is belt-and-suspenders.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/claims/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
