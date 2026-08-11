import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/lead-sources -> GET /crm/lead-sources (LeadSourcesController.list). */
export async function GET() {
  return proxyJson('/crm/lead-sources');
}

/** POST /api/crm/lead-sources -> POST /crm/lead-sources (LeadSourcesController.create). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/lead-sources', 'POST');
}
