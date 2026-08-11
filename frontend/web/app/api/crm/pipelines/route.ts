import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/pipelines — no RLS, org-wide config (New Business, Renewals, ...). */
export async function GET() {
  return proxyJson('/crm/pipelines');
}

/** POST /api/crm/pipelines — create a new pipeline (opportunity:write). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/pipelines', 'POST');
}
