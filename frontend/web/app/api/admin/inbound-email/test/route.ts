import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/inbound-email/test — connects to the SAVED mailbox and reports whether it worked. */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/integrations/inbound-email/test', 'POST');
}
