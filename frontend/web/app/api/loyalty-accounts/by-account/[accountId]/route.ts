import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/loyalty-accounts/by-account/:accountId -> GET /loyalty-accounts/by-account/:accountId (LoyaltyAccountsController.findByAccount). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ accountId: string }> }): Promise<NextResponse> {
  const { accountId } = await params;
  return proxyJson(`/loyalty-accounts/by-account/${accountId}`);
}
