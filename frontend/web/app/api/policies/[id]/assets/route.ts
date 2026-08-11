import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/assets -> GET /policies/:policyId/assets (PolicyAssetController.list). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/assets`);
}

/** POST /api/policies/:id/assets -> POST /policies/:policyId/assets (PolicyAssetController.create). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
