import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/inbound-email — the address that turns an incoming email into a Case, if one is set. */
export async function GET() {
  return proxy('/integrations/inbound-email');
}

/** PUT /api/admin/inbound-email — save. Empty `address` clears it (turns email-to-ticket off). */
export async function PUT(request: NextRequest) {
  return proxyWithBody(request, '/integrations/inbound-email', 'PUT');
}
