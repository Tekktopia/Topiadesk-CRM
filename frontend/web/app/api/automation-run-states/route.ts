import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/automation-run-states?entityType=&entityId= -> GET /automation-run-states (AutomationRunStatesController.list). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const qs = request.nextUrl.search;
  return proxyJson(`/automation-run-states${qs}`);
}
