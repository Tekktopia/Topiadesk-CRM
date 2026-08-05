import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/scheduled-reports -> GET /scheduled-reports
 * (ScheduledReportsController.list) — every scheduled report the caller's
 * RLS scope can see, recipients included. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/scheduled-reports');
}

/**
 * POST /api/scheduled-reports -> POST /scheduled-reports
 * (ScheduledReportsController.create, CreateScheduledReportDto). `filters`/
 * `dimension` are re-validated against the target report's own schema
 * server-side, same as POST /reports/:key/run.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/scheduled-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
