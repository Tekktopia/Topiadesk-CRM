import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/cases/:id/closure-approval -> GET /cases/:id/closure-approval (CasesController.getClosureApproval) — the latest CASE_CLOSURE approval for this case, if any. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/cases/${id}/closure-approval`);
}
