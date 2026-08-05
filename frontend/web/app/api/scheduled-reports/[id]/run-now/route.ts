import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/scheduled-reports/:id/run-now -> POST
 * /scheduled-reports/:id/run-now (ScheduledReportsController.runNow) —
 * creates a PENDING ScheduledReportRun row immediately and enqueues it for
 * near-immediate worker pickup, instead of waiting for the next scheduled
 * poll tick. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/scheduled-reports/${id}/run-now`, { method: 'POST' });
}
