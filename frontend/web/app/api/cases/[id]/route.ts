import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/cases/:id -> GET /cases/:id (CasesController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/cases/${id}`);
}

/**
 * PATCH /api/cases/:id -> PATCH /cases/:id (CasesController.update,
 * UpdateCaseDto). Status/caseType/caseNumber are deliberately not settable
 * here — see app/api/cases/[id]/status/route.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
