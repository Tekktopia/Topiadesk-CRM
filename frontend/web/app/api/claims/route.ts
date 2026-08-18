import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * Explicit allowlist rather than blind `request.nextUrl.search` forwarding.
 *
 * Keep this in sync with ClaimQueryDto — a param missing here is dropped
 * SILENTLY: the request still succeeds, it just returns the unfiltered list.
 * That is exactly how `q`/`lossFrom`/`lossTo`/`take` went unnoticed when the
 * backend gained them; a search box appeared to work while the API kept
 * returning everything. Caught by asserting the API response directly rather
 * than trusting the table.
 */
const FILTER_KEYS = [
  'status',
  'priority',
  'adjusterId',
  'policyId',
  'assignedTeamId',
  'q',
  'catastropheEventId',
  'lossFrom',
  'lossTo',
  'take',
  'skip',
] as const;

/**
 * GET /api/claims — same-origin proxy for GET /claims (see
 * backend/api/src/modules/case-management/claims.controller.ts). Forwards
 * the list page's filters; the upstream endpoint defaults to 100 rows
 * ordered by createdAt desc.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/claims${query ? `?${query}` : ''}`);
}

/** POST /api/claims -> POST /claims (ClaimsController.create, CreateClaimDto). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
