import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';
import { buildCaseFilterQueryString } from '../_lib/filter-query';

export const runtime = 'nodejs';

/** GET /api/cases/count — same-origin proxy for GET /cases/count, used by the ticket workspace's pager ("a–b of N"). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = buildCaseFilterQueryString(searchParams);
  return proxyJson(`/cases/count${query ? `?${query}` : ''}`);
}
