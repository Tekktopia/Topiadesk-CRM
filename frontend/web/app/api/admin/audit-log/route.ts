import type { NextRequest } from 'next/server';
import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/audit-log — proxies backend/api's GET /audit-log, query
 * params (entityType/entityId/actorUserId/action/from/to/take/skip)
 * forwarded as-is. Backend enforces audit_log:read (ADMIN or
 * COMPLIANCE_OFFICER per seed.ts) via PermissionGuard + RLS; this route
 * does no additional gating, so a non-privileged caller sees the backend's
 * 403 pass straight through `proxy()`. */
export async function GET(request: NextRequest) {
  return proxy(`/audit-log${request.nextUrl.search}`);
}
