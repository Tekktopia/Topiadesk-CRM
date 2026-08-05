import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET/PATCH/DELETE /api/business-hours/:id -> /business-hours-calendars/:id (BusinessHoursController). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/business-hours-calendars/${id}`);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/business-hours-calendars/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/business-hours-calendars/${id}`, { method: 'DELETE' });
}
