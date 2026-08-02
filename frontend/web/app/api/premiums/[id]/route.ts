import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/premiums/:id -> GET /premiums/:id (PremiumController.findOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/premiums/${id}`);
}

/** PATCH /api/premiums/:id -> PATCH /premiums/:id (PremiumController.update)
 * — the "record a payment" action (paidAmount/paidDate/status) surfaced
 * from the aging view, plus general commercial-term corrections. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/premiums/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
