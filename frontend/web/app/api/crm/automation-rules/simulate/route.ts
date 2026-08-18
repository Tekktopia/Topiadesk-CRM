import type { NextRequest } from 'next/server';
import { forwardBody } from '../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/automation-rules/simulate — dry run: what the rule WOULD do, without doing it. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/automation-rules/simulate', 'POST');
}
