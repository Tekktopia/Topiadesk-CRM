import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';
import { buildCaseFilterQueryString } from '../_lib/filter-query';

export const runtime = 'nodejs';

/**
 * GET /api/cases/stats — ticket-desk aggregates.
 *
 * Uses the SAME buildCaseFilterQueryString as GET /api/cases on purpose: the
 * whole contract of this endpoint is "these numbers describe the rows below",
 * which only holds if both routes translate the workspace's filters
 * identically. Raw search-string forwarding would drift the moment the
 * helper gains a param.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = buildCaseFilterQueryString(searchParams);
  return proxyJson(`/cases/stats${query ? `?${query}` : ''}`);
}
