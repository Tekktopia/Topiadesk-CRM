import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../campaigns/_shared';

export const runtime = 'nodejs';

/** GET /api/campaign-templates — list. */
export async function GET() {
  return proxyJson('/campaign-templates');
}

/** POST /api/campaign-templates — create (mergeFields validated server-side against the fixed allowlist). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/campaign-templates', 'POST');
}
