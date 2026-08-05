import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/scheduled-reports/runs/:runId/download -> GET
 * /scheduled-reports/runs/:runId/download
 * (ScheduledReportsController.downloadRun) — a static `runs` segment
 * sibling to the `[id]` dynamic segment one level up; Next.js resolves the
 * literal `runs` path segment before matching `[id]`, so this coexists
 * fine with app/api/scheduled-reports/[id]/route.ts. 400s upstream if the
 * run hasn't SUCCEEDED yet (no storageKey to sign a URL for).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }): Promise<NextResponse> {
  const { runId } = await params;
  return proxyJson(`/scheduled-reports/runs/${runId}/download`);
}
