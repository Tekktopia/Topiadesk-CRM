import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/loyalty-accounts -> GET /loyalty-accounts (LoyaltyAccountsController.list) — optional ?search= by account name. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  return proxyJson(`/loyalty-accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`);
}

/** POST /api/loyalty-accounts -> POST /loyalty-accounts (LoyaltyAccountsController.enroll, EnrollLoyaltyAccountDto). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/loyalty-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
