import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/mail-settings/test — sends a real message through the SAVED settings. */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/integrations/mail-settings/test', 'POST');
}
