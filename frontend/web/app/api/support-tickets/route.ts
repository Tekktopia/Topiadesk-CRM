import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/support-tickets -> GET /support-tickets (the caller's own tenant's tickets) */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/support-tickets');
}

/** POST /api/support-tickets -> POST /support-tickets (CreateSupportTicketDto) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/support-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
