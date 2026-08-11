import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/dashboard/deals-trend -> GET /dashboards/operational-kpis/deals-trend
 * (DashboardsController.getDealsTrend) — trailing 12mo won deals + forward
 * 12mo open-deal projection, both bucketed by month. Backs the dashboard's
 * two new trend line-chart cards. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/dashboards/operational-kpis/deals-trend');
}
