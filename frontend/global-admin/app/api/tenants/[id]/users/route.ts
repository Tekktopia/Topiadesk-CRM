import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/tenants/:id/users -> GET /platform/tenants/:id/users */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/platform/tenants/${id}/users`);
}

/** POST /api/tenants/:id/users -> POST /platform/tenants/:id/users (CreateTenantAdminUserDto) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/platform/tenants/${id}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
