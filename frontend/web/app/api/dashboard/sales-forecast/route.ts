import type { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

const FORWARDED_KEYS = ['period', 'groupBy', 'ownerId', 'pipelineId'] as const;

/** GET /api/dashboard/sales-forecast -> GET /dashboards/operational-kpis/sales-forecast
 * (DashboardsController.getSalesForecast) — weighted/unweighted pipeline
 * totals for the current month/quarter, grouped by owner/stage/line of
 * business. The endpoint already existed (built alongside getOperationalKpis)
 * but had no frontend caller until the dashboard's new Sales Forecast panel. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of FORWARDED_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/dashboards/operational-kpis/sales-forecast${query ? `?${query}` : ''}`);
}
