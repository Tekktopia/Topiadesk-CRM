import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../campaigns/_shared';

export const runtime = 'nodejs';

/** GET /api/audience-segments — list (no query params upstream). */
export async function GET() {
  return proxyJson('/audience-segments');
}

/** POST /api/audience-segments — create (filters validated server-side against the fixed field allowlist). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/audience-segments', 'POST');
}
