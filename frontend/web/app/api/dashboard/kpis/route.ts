import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/dashboard/kpis -> GET /dashboards/operational-kpis
 * (DashboardsController.getOperationalKpis) — open opportunities, pipeline
 * value, renewals due next 90 days, active clients. Backs the dashboard's
 * StatTile row. */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/dashboards/operational-kpis');
}
