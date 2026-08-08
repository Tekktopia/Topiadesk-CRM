import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admins/:id/reactivate -> POST /platform/admins/:id/reactivate */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/platform/admins/${id}/reactivate`, { method: 'POST' });
}
