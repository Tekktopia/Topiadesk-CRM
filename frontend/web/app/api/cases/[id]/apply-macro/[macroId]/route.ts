import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/:id/apply-macro/:macroId -> POST /cases/:id/apply-macro/:macroId (CasesController.applyMacro). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; macroId: string }> },
): Promise<NextResponse> {
  const { id, macroId } = await params;
  return proxyJson(`/cases/${id}/apply-macro/${macroId}`, { method: 'POST' });
}
