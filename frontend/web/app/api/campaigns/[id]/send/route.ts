import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** POST /api/campaigns/:id/send — send now (no body); upstream sets SCHEDULED with scheduledSendAt=now and nudges the worker immediately. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/campaigns/${id}/send`, { method: 'POST' });
}
