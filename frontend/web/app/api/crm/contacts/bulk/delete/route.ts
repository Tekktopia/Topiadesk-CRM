import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/contacts/bulk/delete — hard-delete selected contacts. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/contacts/bulk/delete', 'POST');
}
