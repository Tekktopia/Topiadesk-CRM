import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/documents/bulk/archive -> POST /documents/bulk/archive (DocumentsController.bulkArchive). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/documents/bulk/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
