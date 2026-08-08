import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/integrations/connectors');
}

export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/integrations/connectors', 'POST');
}
