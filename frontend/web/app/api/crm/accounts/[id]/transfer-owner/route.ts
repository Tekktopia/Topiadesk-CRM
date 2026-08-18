import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/accounts/:id/transfer-owner — reassigns ownership with a captured reason, distinct from PATCH's generic ownerId update. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/accounts/${id}/transfer-owner`, 'POST');
}
