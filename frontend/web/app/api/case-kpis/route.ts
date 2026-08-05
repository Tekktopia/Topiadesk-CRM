import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/case-kpis?days= -> GET /dashboards/case-kpis (CaseKpisController.getCaseKpis). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const qs = request.nextUrl.search;
  return proxyJson(`/dashboards/case-kpis${qs}`);
}
