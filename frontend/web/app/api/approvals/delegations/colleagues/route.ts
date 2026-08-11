import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/approvals/delegations/colleagues -> GET /approvals/delegations/colleagues (ApprovalDelegationsController.colleagues). */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/approvals/delegations/colleagues');
}
