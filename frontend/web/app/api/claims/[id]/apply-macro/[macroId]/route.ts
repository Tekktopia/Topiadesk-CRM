import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/claims/:id/apply-macro/:macroId -> POST /claims/:id/apply-macro/:macroId (ClaimsController.applyMacro). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; macroId: string }> },
): Promise<NextResponse> {
  const { id, macroId } = await params;
  return proxyJson(`/claims/${id}/apply-macro/${macroId}`, { method: 'POST' });
}
