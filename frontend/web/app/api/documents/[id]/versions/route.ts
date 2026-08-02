import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyMultipart } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/documents/:id/versions -> POST /documents/:id/versions
 * (DocumentsController.addVersion, multipart `file` + optional
 * `changeNote`) — uploads a new version of an existing document, becoming
 * its new `currentVersion`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyMultipart(`/documents/${id}/versions`, request);
}
