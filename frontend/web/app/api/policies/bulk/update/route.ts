import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/policies/bulk/update -> POST /policies/bulk/update (PolicyController.bulkUpdate). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/policies/bulk/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
