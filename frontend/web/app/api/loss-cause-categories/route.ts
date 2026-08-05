import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET/POST /api/loss-cause-categories -> /loss-cause-categories (LossCauseCategoriesController) — feeds the causeOfLossCategoryId select on the "New claim" dialog. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/loss-cause-categories');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/loss-cause-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
