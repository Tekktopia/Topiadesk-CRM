import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/consent-records/current?contactId=... -> GET /crm/consent-records/current. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/consent-records/current${request.nextUrl.search}`);
}
