import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/assignment-rules -> GET /assignment-rules (AssignmentRulesController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/assignment-rules');
}

/** POST /api/assignment-rules -> POST /assignment-rules (AssignmentRulesController.create, CreateAssignmentRuleDto). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/assignment-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
