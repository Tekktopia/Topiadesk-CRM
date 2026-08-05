import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/:id/link-child -> POST /cases/:id/link-child (CasesController.linkChild, LinkChildCaseDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/link-child`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
