import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/approvals -> GET /approvals (ApprovalsController.list, ?status). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  return proxyJson(`/approvals${status ? `?status=${status}` : ''}`);
}
