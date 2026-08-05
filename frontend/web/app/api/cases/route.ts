import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

const FILTER_KEYS = ['status', 'priority', 'caseType', 'assignedToId', 'assignedTeamId', 'accountId', 'categoryId'] as const;

/**
 * GET /api/cases — same-origin proxy for GET /cases (see
 * backend/api/src/modules/case-management/cases.controller.ts). Forwards
 * the list page's status/priority/caseType/assignedTo filters; the
 * upstream endpoint caps at 100 rows ordered by createdAt desc.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/cases${query ? `?${query}` : ''}`);
}

/** POST /api/cases -> POST /cases (CasesController.create, CreateCaseDto) — caseNumber is server-generated. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
