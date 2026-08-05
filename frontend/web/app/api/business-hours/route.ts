import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET/POST /api/business-hours -> /business-hours-calendars (see
 * backend/api/src/modules/case-management/business-hours.controller.ts —
 * `@Controller('business-hours-calendars')`). No dedicated management page
 * in this batch; this backs the businessHoursCalendarId select on the SLA
 * policy form.
 */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/business-hours-calendars');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/business-hours-calendars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
