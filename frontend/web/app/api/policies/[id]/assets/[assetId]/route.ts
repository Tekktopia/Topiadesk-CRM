import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/policies/:id/assets/:assetId -> PATCH /policies/:policyId/assets/:id (PolicyAssetController.update). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> },
): Promise<NextResponse> {
  const { id, assetId } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/assets/${assetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** DELETE /api/policies/:id/assets/:assetId -> DELETE /policies/:policyId/assets/:id (PolicyAssetController.remove). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> },
): Promise<NextResponse> {
  const { id, assetId } = await params;
  return proxyJson(`/policies/${id}/assets/${assetId}`, { method: 'DELETE' });
}
