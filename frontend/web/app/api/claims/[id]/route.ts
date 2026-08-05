import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/:id -> GET /claims/:id (ClaimsController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/claims/${id}`);
}

/**
 * PATCH /api/claims/:id -> PATCH /claims/:id (ClaimsController.update,
 * UpdateClaimDto). Status is deliberately not settable here — see
 * app/api/claims/[id]/status/route.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/claims/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
