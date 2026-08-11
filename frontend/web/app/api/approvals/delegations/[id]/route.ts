import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/approvals/delegations/:id -> DELETE /approvals/delegations/:id (ApprovalDelegationsController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/approvals/delegations/${id}`, { method: 'DELETE' });
}
