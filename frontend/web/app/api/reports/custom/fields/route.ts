import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/reports/custom/fields?entity=account -> GET /custom-reports/fields?entity= (CustomReportController.listFields). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/custom-reports/fields${request.nextUrl.search}`);
}
