import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/cases/bulk/assign -> POST /cases/bulk/assign (CasesController.bulkAssign) — replaces the old per-row PATCH fan-out. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/cases/bulk/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
