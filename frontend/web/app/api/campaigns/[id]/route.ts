import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/campaigns/${id}`);
}

/** PATCH — upstream 409s once the campaign is SENDING/SENT (see campaigns.controller.ts's IN_FLIGHT_OR_DONE). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/campaigns/${id}`, 'PATCH');
}
