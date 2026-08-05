import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

const FILTER_KEYS = ['status', 'priority', 'adjusterId', 'policyId', 'assignedTeamId'] as const;

/**
 * GET /api/claims — same-origin proxy for GET /claims (see
 * backend/api/src/modules/case-management/claims.controller.ts). Forwards
 * the list page's status/priority/adjuster filters; the upstream endpoint
 * caps at 100 rows ordered by createdAt desc.
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
