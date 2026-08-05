import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/loyalty-accounts/:id/earn -> POST /loyalty-accounts/:id/earn (LoyaltyAccountsController.earn, EarnPointsDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/loyalty-accounts/${id}/earn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
