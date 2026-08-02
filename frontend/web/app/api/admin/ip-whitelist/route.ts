import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/identity/ip-whitelist');
}

export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/ip-whitelist', 'POST');
}
