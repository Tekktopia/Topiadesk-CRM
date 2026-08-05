import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET/POST /api/case-categories -> /case-categories (CaseCategoriesController) — feeds the categoryId select on the "New case" dialog. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/case-categories');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/case-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
