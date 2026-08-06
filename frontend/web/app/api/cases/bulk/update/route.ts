import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/bulk/update -> POST /cases/bulk/update (CasesController.bulkUpdate) — replaces the old per-row POST :id/status fan-out. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/cases/bulk/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
