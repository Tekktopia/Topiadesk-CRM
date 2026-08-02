import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

export async function GET() {
  return proxyJson('/crm/carriers');
}

export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/carriers', 'POST');
}
