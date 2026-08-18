import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/contacts/count — real total for the current filter set (list() caps `take`). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/contacts/count${request.nextUrl.search}`);
}
