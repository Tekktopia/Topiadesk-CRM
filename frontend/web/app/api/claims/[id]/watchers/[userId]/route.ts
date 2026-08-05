import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/claims/:id/watchers/:userId -> DELETE /claims/:id/watchers/:userId (ClaimsController.removeWatcher). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse> {
  const { id, userId } = await params;
  return proxyJson(`/claims/${id}/watchers/${userId}`, { method: 'DELETE' });
}
