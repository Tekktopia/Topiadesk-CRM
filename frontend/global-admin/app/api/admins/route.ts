import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admins -> GET /platform/admins */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/platform/admins');
}

/** POST /api/admins -> POST /platform/admins (CreatePlatformAdminDto) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/platform/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
