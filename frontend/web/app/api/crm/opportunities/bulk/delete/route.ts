import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/opportunities/bulk/delete — bulk-delete selected opportunities. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/opportunities/bulk/delete', 'POST');
}
