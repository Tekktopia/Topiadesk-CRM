import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/contacts/stats — header aggregates over the same filter set as the list. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/contacts/stats${request.nextUrl.search}`);
}
