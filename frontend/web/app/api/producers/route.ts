import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/producers -> GET /producers (ProducersController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/producers');
}

/** POST /api/producers -> POST /producers (ProducersController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/producers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
