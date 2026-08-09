import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/business-rules -> GET /business-rules (BusinessRulesController.list, ?entityType). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  return proxyJson(`/business-rules${entityType ? `?entityType=${entityType}` : ''}`);
}

/** POST /api/business-rules -> POST /business-rules (BusinessRulesController.create, CreateBusinessRuleDto). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/business-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
