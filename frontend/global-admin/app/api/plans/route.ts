import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/plans -> GET /platform/plans */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/platform/plans');
}

/** POST /api/plans -> POST /platform/plans (CreatePlanDto) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/platform/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
