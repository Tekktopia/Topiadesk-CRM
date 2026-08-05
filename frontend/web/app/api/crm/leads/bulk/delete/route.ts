import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/leads/bulk/delete — bulk-delete selected leads. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/leads/bulk/delete', 'POST');
}
