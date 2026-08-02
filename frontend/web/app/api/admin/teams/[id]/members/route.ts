import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/teams/:id/members — body: { userId: string, role?: 'MEMBER' | 'LEAD' }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyWithBody(request, `/identity/teams/${id}/members`, 'POST');
}
