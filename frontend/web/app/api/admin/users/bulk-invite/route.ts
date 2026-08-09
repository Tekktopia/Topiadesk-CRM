import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/users/bulk-invite -> POST /identity/users/bulk-invite */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/users/bulk-invite', 'POST');
}
