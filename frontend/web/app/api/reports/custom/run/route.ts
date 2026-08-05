import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/reports/custom/run -> POST /custom-reports/run
 * (CustomReportController.run). Forwards the body byte-for-byte — every
 * entity/field/filter name in it is re-validated server-side against
 * CUSTOM_REPORT_REGISTRY before it ever reaches a database call; this proxy
 * does no interpretation.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/custom-reports/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
