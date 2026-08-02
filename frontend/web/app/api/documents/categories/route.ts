import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/documents/categories -> GET /documents/categories
 * (DocumentsController.listCategories) — populates the upload dialog's
 * category select. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/documents/categories');
}
