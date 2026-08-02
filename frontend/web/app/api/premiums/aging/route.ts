import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/premiums/aging -> GET /premiums/aging (PremiumController.aging).
 * Backs the /premiums aging chart + table — rows come from the
 * `premium_aging_summary_scoped` RLS-safe view (see
 * packages/db/prisma/rls/004_reporting_views.sql), bucketed into
 * CURRENT/1_30/31_60/61_90/90_PLUS server-side. Forwards the optional
 * `policyId`/`bucket` filters.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const policyId = searchParams.get('policyId');
  const bucket = searchParams.get('bucket');
  if (policyId) qs.set('policyId', policyId);
  if (bucket) qs.set('bucket', bucket);
  const query = qs.toString();
  return proxyJson(`/premiums/aging${query ? `?${query}` : ''}`);
}
