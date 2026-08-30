import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/inbound-email — current IMAP polling settings. The password is never returned. */
export async function GET() {
  return proxy('/integrations/inbound-email');
}

/** PUT /api/admin/inbound-email — save. Omit `password` to keep the stored one. */
export async function PUT(request: NextRequest) {
  return proxyWithBody(request, '/integrations/inbound-email', 'PUT');
}
