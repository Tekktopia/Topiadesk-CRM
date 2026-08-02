import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyStream } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/documents/:id/download -> GET /documents/:id/download
 * (DocumentsController.download) — streams the file through rather than
 * parsing JSON, forwarding Content-Type/Content-Disposition/Content-Length
 * so the browser's native download UX (correct filename, size) works.
 * Optional `?versionId=` downloads a specific historical version instead
 * of the current one. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('versionId');
  return proxyStream(`/documents/${id}/download${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''}`);
}
