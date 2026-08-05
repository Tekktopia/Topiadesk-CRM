import type { NextRequest } from 'next/server';
import { forwardBody } from '../../_shared';

export const runtime = 'nodejs';

/** POST /api/campaigns/:id/schedule — body: { scheduledSendAt: ISO 8601 }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/campaigns/${id}/schedule`, 'POST');
}
