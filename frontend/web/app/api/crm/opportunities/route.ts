import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/opportunities — filters (accountId/pipelineId/pipelineStageId/ownerId/isOpen/lineOfBusiness). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/opportunities${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/opportunities', 'POST');
}
