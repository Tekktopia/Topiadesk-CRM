import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';
import { buildCaseFilterQueryString } from './_lib/filter-query';

export const runtime = 'nodejs';

/**
 * GET /api/cases — same-origin proxy for GET /cases (see
 * backend/api/src/modules/case-management/cases.controller.ts). Forwards
 * the ticket workspace's full filter set; `take` defaults to 100 upstream
 * when omitted.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = buildCaseFilterQueryString(searchParams);
  return proxyJson(`/cases${query ? `?${query}` : ''}`);
}

/** POST /api/cases -> POST /cases (CasesController.create, CreateCaseDto) — caseNumber is server-generated. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
