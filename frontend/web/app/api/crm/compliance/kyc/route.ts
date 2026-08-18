import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/compliance/kyc -> GET /crm/compliance/kyc (ComplianceController.kyc). */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/compliance/kyc${request.nextUrl.search}`);
}
