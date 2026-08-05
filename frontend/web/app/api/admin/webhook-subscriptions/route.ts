import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/integrations/webhook-subscriptions');
}

/** Response includes the raw signing secret — shown once, see webhook-form-dialog.tsx. */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/integrations/webhook-subscriptions', 'POST');
}
