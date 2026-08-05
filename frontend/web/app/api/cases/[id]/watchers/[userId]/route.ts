import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/cases/:id/watchers/:userId -> DELETE /cases/:id/watchers/:userId (CasesController.removeWatcher). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse> {
  const { id, userId } = await params;
  return proxyJson(`/cases/${id}/watchers/${userId}`, { method: 'DELETE' });
}
