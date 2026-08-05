import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/:id/claim -> POST /cases/:id/claim (CasesController.claimCase) — self-assign from the unassigned queue. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/cases/${id}/claim`, { method: 'POST' });
}
