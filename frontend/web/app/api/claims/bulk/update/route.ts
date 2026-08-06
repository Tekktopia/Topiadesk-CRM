import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/claims/bulk/update -> POST /claims/bulk/update (ClaimsController.bulkUpdate) — replaces the old per-row POST :id/status fan-out. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/claims/bulk/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
