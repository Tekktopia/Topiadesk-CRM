import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/cases/:id/watchers -> GET /cases/:id/watchers (CasesController.listWatchers). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/cases/${id}/watchers`);
}

/** POST /api/cases/:id/watchers -> POST /cases/:id/watchers (CasesController.addWatcher, AddWatcherDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/watchers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
