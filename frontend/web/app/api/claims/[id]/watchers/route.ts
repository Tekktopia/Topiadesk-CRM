import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/claims/:id/watchers -> GET /claims/:id/watchers (ClaimsController.listWatchers). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/claims/${id}/watchers`);
}

/** POST /api/claims/:id/watchers -> POST /claims/:id/watchers (ClaimsController.addWatcher, AddWatcherDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/claims/${id}/watchers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
