import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/**
 * POST /api/crm/contacts/bulk/assign — move selected contacts to another
 * account. Carrier-linked contacts are rejected upstream and come back in
 * `skipped` (a contact has exactly one parent — account OR carrier).
 */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/contacts/bulk/assign', 'POST');
}
