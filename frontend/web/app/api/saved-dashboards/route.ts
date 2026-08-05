import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/saved-dashboards -> GET /saved-dashboards (SavedDashboardsController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/saved-dashboards');
}

/** POST /api/saved-dashboards -> POST /saved-dashboards (SavedDashboardsController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/saved-dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
