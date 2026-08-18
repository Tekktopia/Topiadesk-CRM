import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/tasks/bulk/delete — bulk delete over the selected task ids. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/tasks/bulk/delete', 'POST');
}
