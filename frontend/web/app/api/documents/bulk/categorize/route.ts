import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/documents/bulk/categorize -> POST /documents/bulk/categorize (DocumentsController.bulkCategorize). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/documents/bulk/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
