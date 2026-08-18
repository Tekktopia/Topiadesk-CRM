import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/pipelines/:id/usage — per-stage deal counts/value, so Pipeline Setup can show what a config change affects. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/pipelines/${id}/usage`);
}
