import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson, proxyMultipart } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/documents -> GET /documents (DocumentsController.list),
 * optionally filtered by categoryId. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');
  return proxyJson(`/documents${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`);
}

/** POST /api/documents -> POST /documents (DocumentsController.upload,
 * multipart `file` + optional `categoryId` field). Forwards the incoming
 * multipart body as-is — see proxyMultipart's comment for why. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyMultipart('/documents', request);
}
