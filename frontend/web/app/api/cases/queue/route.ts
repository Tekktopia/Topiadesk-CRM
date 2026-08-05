import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/cases/queue -> GET /cases/queue (CasesController.queue) — the
 * unassigned, still-active work queue an agent/team self-assigns from via
 * POST :id/claim. Must be a sibling route file, not a query param on
 * /api/cases, to match the backend's own literal-segment-before-:id
 * ordering (see cases.controller.ts's comment on 'mine'/'queue').
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  return proxyJson(`/cases/queue${teamId ? `?teamId=${teamId}` : ''}`);
}
