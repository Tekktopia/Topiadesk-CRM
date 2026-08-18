import type { NextRequest } from 'next/server';
import { proxyJson } from '../_shared';

export const runtime = 'nodejs';

/**
 * GET /api/crm/users — thin proxy to backend/api's GET /identity/users,
 * namespaced under crm/ (rather than a shared app/api/identity/users route)
 * so it stays entirely inside this agent's app/(crm)/ + app/api/crm/**
 * sandbox with zero risk of colliding with the Admin agent's own identity
 * management routes built in parallel.
 *
 * Only used for opportunistic owner/assignee name lookups (see
 * app/(crm)/_lib/hooks.ts's `useDirectoryUsers`) — GET /identity/users
 * requires the `identity:read` permission, which only ADMIN and
 * COMPLIANCE_OFFICER hold per packages/db/prisma/seed.ts, so a MANAGER or
 * ACCOUNT_HANDLER caller will get a 403 here and the UI falls back to
 * showing a short id instead of a name.
 *
 * Forwards the query string: GET /identity/users accepts ListUsersQueryDto
 * (q / departmentId / branchId / status / pagination). This route used to
 * call proxyJson('/identity/users') with no params, so any caller passing a
 * filter got the whole unfiltered directory back and had to narrow it
 * client-side — silently, with no error to notice.
 */
export async function GET(request: NextRequest) {
  return proxyJson(`/identity/users${request.nextUrl.search}`);
}
