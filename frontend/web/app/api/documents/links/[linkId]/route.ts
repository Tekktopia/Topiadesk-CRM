import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/documents/links/:linkId -> DELETE /documents/links/:linkId
 * (DocumentsController.deleteLink) — unlink a document from an entity
 * (does not delete the document itself). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
): Promise<NextResponse> {
  const { linkId } = await params;
  return proxyJson(`/documents/links/${linkId}`, { method: 'DELETE' });
}
