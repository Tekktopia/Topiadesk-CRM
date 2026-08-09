import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/users — proxies backend/api's GET /identity/users, query
 * params (take/skip/departmentId/branchId/status/search) forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxy(`/identity/users${request.nextUrl.search}`);
}

/** POST /api/admin/users — proxies backend/api's POST /identity/users
 * (single-user create; distinct from the CSV bulk-invite path below). */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/users', 'POST');
}
