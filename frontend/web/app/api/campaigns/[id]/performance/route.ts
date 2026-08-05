import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/campaigns/:id/performance — aggregate counts + delivery/open/click/bounce rates (and per-variant breakdown for A/B campaigns). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/campaigns/${id}/performance`);
}
