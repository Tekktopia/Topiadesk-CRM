import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/tenants/admin-summary -> GET /platform/tenants/admin-summary */
export async function GET(): Promise<NextResponse> {
  return proxyJson('/platform/tenants/admin-summary');
}
