import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/tasks — filters (assigneeId/status/dueBefore/dueAfter). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/tasks${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/tasks', 'POST');
}
