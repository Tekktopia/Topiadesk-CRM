import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/premiums/bulk/mark-paid -> POST /premiums/bulk/mark-paid (PremiumController.bulkMarkPaid). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson('/premiums/bulk/mark-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
