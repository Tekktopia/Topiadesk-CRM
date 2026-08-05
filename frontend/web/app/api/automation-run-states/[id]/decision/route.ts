import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/automation-run-states/:id/decision -> POST /automation-run-states/:id/decision (AutomationRunStatesController.decide, DecideAutomationRunDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/automation-run-states/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
