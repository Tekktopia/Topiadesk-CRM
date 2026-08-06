import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/approval-threshold-rules -> GET /policies/approval-threshold-rules (ApprovalThresholdRulesController.list). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/policies/approval-threshold-rules');
}

/** POST /api/policies/approval-threshold-rules -> POST /policies/approval-threshold-rules (ApprovalThresholdRulesController.create). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/policies/approval-threshold-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
