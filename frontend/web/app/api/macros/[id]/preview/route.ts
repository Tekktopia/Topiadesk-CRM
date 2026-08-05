import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/macros/:id/preview -> POST /macros/:id/preview
 * (MacrosController.preview, MacroPreviewRequestDto — { entityType,
 * entityId } in the body) — dry-run used by the case detail's apply-macro
 * flow to show what would change before committing via
 * POST /cases/:id/apply-macro/:macroId.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/macros/${id}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
