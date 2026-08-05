import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET/POST /api/business-hours/:id/holidays -> /business-hours-calendars/:id/holidays (BusinessHoursController.listHolidays/addHoliday). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/business-hours-calendars/${id}/holidays`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/business-hours-calendars/${id}/holidays`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
