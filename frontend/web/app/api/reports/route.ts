import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/reports -> GET /reports (ReportsController.listCatalog) — the
 * live fixed-registry catalog (12 report definitions at time of writing,
 * see packages/reports/src/definitions/), each with its own zod
 * `filterSchema` (rendered server-side as JSON Schema) and
 * `allowedDimensions`. The /reports and /reports/scheduled pages drive
 * everything (filter fields, dimension pickers) off this response — there
 * is no hardcoded report list on the frontend.
 */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/reports');
}
