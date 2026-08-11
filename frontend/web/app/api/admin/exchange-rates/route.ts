import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/identity/exchange-rates');
}

export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/exchange-rates', 'POST');
}
