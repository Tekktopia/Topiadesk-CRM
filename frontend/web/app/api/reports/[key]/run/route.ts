import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/reports/:key/run -> POST /reports/:key/run
 * (ReportsController.run, RunReportDto: `{filters, dimension?, page?,
 * pageSize?}`). `filters`/`dimension` are re-validated server-side against
 * the target report's own zod `filterSchema`/`allowedDimensions` — this
 * proxy forwards the body byte-for-byte, no interpretation here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await params;
  const body = await request.text();
  return proxyJson(`/reports/${key}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
