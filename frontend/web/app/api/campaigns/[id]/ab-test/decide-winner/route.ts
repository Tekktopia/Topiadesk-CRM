import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/campaigns/:id/ab-test/decide-winner — compares variants by the campaign's abTestMetric and queues held-back recipients to the winner. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/campaigns/${id}/ab-test/decide-winner`, { method: 'POST' });
}
