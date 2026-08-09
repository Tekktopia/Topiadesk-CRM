import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/support-tickets/:id -> GET /platform/support-tickets/:id */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/platform/support-tickets/${id}`);
}

/** PATCH /api/support-tickets/:id -> PATCH /platform/support-tickets/:id */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/platform/support-tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
