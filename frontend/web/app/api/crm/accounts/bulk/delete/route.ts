import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/accounts/bulk/delete — bulk-delete selected accounts. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/accounts/bulk/delete', 'POST');
}
