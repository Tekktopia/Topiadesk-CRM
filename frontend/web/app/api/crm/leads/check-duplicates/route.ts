import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/leads/check-duplicates?email=&phone=&firstName=&lastName=&companyName= — EXACT/STRONG/POSSIBLE tiered matches. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/leads/check-duplicates${request.nextUrl.search}`);
}
