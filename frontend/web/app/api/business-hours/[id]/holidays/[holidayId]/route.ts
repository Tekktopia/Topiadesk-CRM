import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH/DELETE /api/business-hours/:id/holidays/:holidayId -> /business-hours-calendars/:id/holidays/:holidayId (BusinessHoursController.updateHoliday/removeHoliday). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; holidayId: string }> },
): Promise<NextResponse> {
  const { id, holidayId } = await params;
  const body = await request.text();
  return proxyJson(`/business-hours-calendars/${id}/holidays/${holidayId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; holidayId: string }> },
): Promise<NextResponse> {
  const { id, holidayId } = await params;
  return proxyJson(`/business-hours-calendars/${id}/holidays/${holidayId}`, { method: 'DELETE' });
}
