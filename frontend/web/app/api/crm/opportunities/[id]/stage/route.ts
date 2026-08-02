import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** PATCH /api/crm/opportunities/:id/stage — the Kanban board's stage-transition action. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/opportunities/${id}/stage`, 'PATCH');
}
