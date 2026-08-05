import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/:id/request-closure -> POST /cases/:id/request-closure (CasesController.requestClosure). Non-COMPLAINT cases close directly; COMPLAINT cases create a pending CASE_CLOSURE approval instead. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/request-closure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
