import type { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

const FORWARDED_KEYS = ['period', 'groupBy', 'ownerId', 'lineOfBusiness'] as const;

/** GET /api/dashboard/renewal-forecast -> GET /dashboards/operational-kpis/renewal-forecast
 * (DashboardsController.getRenewalForecast) — weighted/unweighted renewal
 * premium totals for the current month/quarter, grouped by status/owner/
 * line of business. Renewal counterpart to sales-forecast/route.ts. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of FORWARDED_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/dashboards/operational-kpis/renewal-forecast${query ? `?${query}` : ''}`);
}
