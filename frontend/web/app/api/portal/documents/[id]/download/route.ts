import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { portalProxyStream } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/portal/documents/:id/download -> GET /portal/documents/:id/download. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('versionId');
  return portalProxyStream(`/portal/documents/${id}/download${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''}`);
}
