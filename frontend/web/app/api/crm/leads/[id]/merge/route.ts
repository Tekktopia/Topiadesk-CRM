import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/leads/:id/merge — :id is the winner, body { loserId }. Can 400 with a specific blocking-reference message (see merge.ts) — forwarded through as-is. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/leads/${id}/merge`, 'POST');
}
