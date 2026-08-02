import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/opportunities/${id}/market-submissions`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/opportunities/${id}/market-submissions`, 'POST');
}
