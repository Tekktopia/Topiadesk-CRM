import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/activities?accountId=...|opportunityId=...|leadId=...|policyId=...&type=... */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/activities${request.nextUrl.search}`);
}

/** POST /api/crm/activities — backs the ActivityTimeline composite's "log an activity" form. */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/activities', 'POST');
}
