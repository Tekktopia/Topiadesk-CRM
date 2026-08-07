import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/tenants -> GET /platform/tenants */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/platform/tenants');
}

/** POST /api/tenants -> POST /platform/tenants (CreateTenantDto) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/platform/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
