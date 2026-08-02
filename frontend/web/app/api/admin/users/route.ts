import type { NextRequest } from 'next/server';
import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/users — proxies backend/api's GET /identity/users, query
 * params (take/skip/departmentId/branchId/status/search) forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxy(`/identity/users${request.nextUrl.search}`);
}
