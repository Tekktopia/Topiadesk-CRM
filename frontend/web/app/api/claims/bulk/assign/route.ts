import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/claims/bulk/assign -> POST /claims/bulk/assign (ClaimsController.bulkAssign) — replaces the old per-row PATCH fan-out. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/claims/bulk/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
