import type { NextRequest } from 'next/server';
import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/notifications — RLS-scoped to the caller's own
 * notifications on the backend (no @RequirePermission on this controller —
 * every authenticated user has an inbox, not just admins). Forwards
 * query params (type/isRead/take/skip) as-is — found live: this previously
 * dropped them entirely (no `request` param at all), silently no-op'ing
 * the notifications page's type/read-status filters and pagination. */
export async function GET(request: NextRequest) {
  return proxy(`/notifications${request.nextUrl.search}`);
}
