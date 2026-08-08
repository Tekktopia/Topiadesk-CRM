import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/tenants/:id/users/:userId/reactivate -> POST /platform/tenants/:id/users/:userId/reactivate */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }): Promise<NextResponse> {
  const { id, userId } = await params;
  return proxyJson(`/platform/tenants/${id}/users/${userId}/reactivate`, { method: 'POST' });
}
