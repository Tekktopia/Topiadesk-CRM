import type { NextRequest } from 'next/server';
import { proxyFile } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/contacts/export — CSV download, same filters as the list endpoint. */
export async function GET(request: NextRequest) {
  return proxyFile(`/crm/contacts/export${request.nextUrl.search}`);
}
