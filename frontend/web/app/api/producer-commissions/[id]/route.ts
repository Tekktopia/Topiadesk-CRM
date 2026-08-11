import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/producer-commissions/:id -> GET /producer-commissions/:id (ProducerCommissionsController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/producer-commissions/${id}`);
}

/** PATCH /api/producer-commissions/:id -> PATCH /producer-commissions/:id (ProducerCommissionsController.update) — the PENDING -> APPROVED -> PAID status move, plus commercial-figure corrections. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/producer-commissions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
