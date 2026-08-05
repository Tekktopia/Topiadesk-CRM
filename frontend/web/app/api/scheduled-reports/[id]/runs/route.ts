import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/scheduled-reports/:id/runs -> GET /scheduled-reports/:id/runs
 * (ScheduledReportsController.listRuns) — most recent 50 runs, newest
 * first. Backs the run-history table on the scheduled report detail panel. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/scheduled-reports/${id}/runs`);
}
