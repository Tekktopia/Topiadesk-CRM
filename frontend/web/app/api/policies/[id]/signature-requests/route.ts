import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/signature-requests -> GET /policies/:id/signature-requests (SignatureRequestsController.list). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/policies/${id}/signature-requests`);
}

/** POST /api/policies/:id/signature-requests -> POST /policies/:id/signature-requests (SignatureRequestsController.create). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/signature-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
