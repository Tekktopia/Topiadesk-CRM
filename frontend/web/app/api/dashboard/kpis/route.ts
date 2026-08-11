import type { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

const FORWARDED_KEYS = ['ownerId', 'lineOfBusiness'] as const;

/** GET /api/dashboard/kpis -> GET /dashboards/operational-kpis
 * (DashboardsController.getOperationalKpis) — open opportunities, pipeline
 * value, renewals due next 90 days, active clients. Backs the dashboard's
 * StatTile row. `ownerId`/`lineOfBusiness` forward straight through, same
 * FORWARDED_KEYS/URLSearchParams pattern sales-forecast/route.ts uses. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of FORWARDED_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return proxyJson(`/dashboards/operational-kpis${query ? `?${query}` : ''}`);
}
