import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/saved-views/:id/run — executes the view's stored filters/sort, optional ?take=&skip=. No request body. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/saved-views/${id}/run${request.nextUrl.search}`, { method: 'POST' });
}
