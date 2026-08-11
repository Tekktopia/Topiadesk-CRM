import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return proxy(`/identity/field-permissions${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/identity/field-permissions', 'POST');
}
