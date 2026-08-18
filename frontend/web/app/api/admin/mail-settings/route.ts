import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/mail-settings — current transport. The password is never returned. */
export async function GET() {
  return proxy('/integrations/mail-settings');
}

/** PUT /api/admin/mail-settings — save. Omit `password` to keep the stored one. */
export async function PUT(request: NextRequest) {
  return proxyWithBody(request, '/integrations/mail-settings', 'PUT');
}
