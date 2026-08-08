import type { NextRequest } from 'next/server';
import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/audit-log/verify — proxies backend/api's
 * GET /identity/audit-log/verify (AuditExportController.verify), the
 * hash-chain self-consistency check. Optional fromCheckpointId/
 * toCheckpointId query params forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxy(`/identity/audit-log/verify${request.nextUrl.search}`);
}
