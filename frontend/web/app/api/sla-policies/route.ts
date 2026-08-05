import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/sla-policies -> GET /sla-policies (SlaPoliciesController.list, ?entityType). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  return proxyJson(`/sla-policies${entityType ? `?entityType=${entityType}` : ''}`);
}

/** POST /api/sla-policies -> POST /sla-policies (SlaPoliciesController.create, CreateSlaPolicyDto — optional inline `targets`). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/sla-policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
