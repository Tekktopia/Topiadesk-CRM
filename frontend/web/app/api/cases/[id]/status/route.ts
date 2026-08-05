import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * POST /api/cases/:id/status -> POST /cases/:id/status
 * (CasesController.changeStatus, ChangeCaseStatusDto) — the case lifecycle
 * status-transition action, including the PENDING_CUSTOMER/PENDING_CARRIER
 * holds. The backend validates against CASE_STATUS_TRANSITIONS and handles
 * the RESOLUTION SlaClock pause/resume bookkeeping.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/cases/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
