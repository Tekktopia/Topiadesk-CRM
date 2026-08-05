import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/identity/scim-tokens');
}

/** Response includes the raw token — shown once, see scim-token-create-dialog.tsx. */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/scim-tokens', 'POST');
}
