import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/cases/:id/merge -> POST /cases/:id/merge (CasesController.merge,
 * MergeCaseDto) — non-destructive: the case at :id becomes a MERGED child
 * of targetCaseId (see the schema's own doc comment on CaseLinkType).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
