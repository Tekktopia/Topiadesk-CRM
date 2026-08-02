import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/policies — same-origin proxy for GET /policies (see
 * backend/api/src/modules/policy/policy.controller.ts). Forwards the
 * `status`/`accountId` filters the list page's filter bar sets; the
 * upstream endpoint already caps at 100 rows ordered by expiryDate asc.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const status = searchParams.get('status');
  const accountId = searchParams.get('accountId');
  if (status) qs.set('status', status);
  if (accountId) qs.set('accountId', accountId);
  const query = qs.toString();
  return proxyJson(`/policies${query ? `?${query}` : ''}`);
}
