import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/tasks/bulk/update — bulk update over the selected task ids. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/tasks/bulk/update', 'POST');
}
