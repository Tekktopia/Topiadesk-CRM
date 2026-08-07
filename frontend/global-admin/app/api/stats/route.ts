import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/stats -> GET /platform/stats */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/platform/stats');
}
