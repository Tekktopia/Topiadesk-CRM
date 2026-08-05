import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/scheduled-reports/:id -> PATCH /scheduled-reports/:id
 * (ScheduledReportsController.update, UpdateScheduledReportDto) — also used
 * for the pause/resume toggle (`{isActive}` only). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/scheduled-reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** DELETE /api/scheduled-reports/:id -> DELETE /scheduled-reports/:id
 * (ScheduledReportsController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/scheduled-reports/${id}`, { method: 'DELETE' });
}
