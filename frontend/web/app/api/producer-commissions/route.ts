import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/producer-commissions -> GET /producer-commissions (ProducerCommissionsController.list). Forwards the optional producerId/policyId/status/period filters. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ['producerId', 'policyId', 'status', 'period']) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/producer-commissions${query ? `?${query}` : ''}`);
}

/** POST /api/producer-commissions -> POST /producer-commissions (ProducerCommissionsController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/producer-commissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
