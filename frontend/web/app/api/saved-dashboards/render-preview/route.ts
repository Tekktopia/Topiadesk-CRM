import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/saved-dashboards/render-preview -> POST /saved-dashboards/render-preview (SavedDashboardsController.renderPreview). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/saved-dashboards/render-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
