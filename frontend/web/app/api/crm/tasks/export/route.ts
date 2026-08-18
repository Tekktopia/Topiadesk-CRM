import type { NextRequest } from 'next/server';
import { proxyFile } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/tasks/export — CSV download, same filters as the list endpoint. */
export async function GET(request: NextRequest) {
  return proxyFile(`/crm/tasks/export${request.nextUrl.search}`);
}
