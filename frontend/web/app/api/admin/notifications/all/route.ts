import type { NextRequest } from 'next/server';
import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/notifications/all — proxies backend/api's
 * GET /notifications/admin (NotificationsController.listAdmin()), the
 * org-wide view distinct from the personal-inbox GET /notifications this
 * subtree's sibling route.ts already proxies. Query params
 * (recipientUserId?/type?/channel?/status?) forwarded as-is. */
export async function GET(request: NextRequest) {
  return proxy(`/notifications/admin${request.nextUrl.search}`);
}
