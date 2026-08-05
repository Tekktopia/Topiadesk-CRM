import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/contacts/check-duplicates?email=&phone=&firstName=&lastName= — EXACT/STRONG/POSSIBLE tiered matches. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/contacts/check-duplicates${request.nextUrl.search}`);
}
