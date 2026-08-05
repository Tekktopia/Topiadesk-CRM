import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/claims/:id/reopen -> POST /claims/:id/reopen (ClaimsController.reopen, ReopenClaimDto — reason required). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/claims/${id}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
