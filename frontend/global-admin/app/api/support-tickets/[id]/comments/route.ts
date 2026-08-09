import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/support-tickets/:id/comments -> POST /platform/support-tickets/:id/comments */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/platform/support-tickets/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
