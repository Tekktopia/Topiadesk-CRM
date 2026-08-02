import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/tasks/mine — "My Tasks" view, scoped server-side to the caller via backend/api's @CurrentUser(). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/tasks/mine${request.nextUrl.search}`);
}
