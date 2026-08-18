import type { NextRequest } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/notifications -> GET /notifications (NotificationsController.listMine,
 * RLS-scoped to the caller).
 *
 * Forwards the query string — listMine accepts ListMyNotificationsQueryDto
 * (type / isRead / take / skip). Without this the `take` default silently
 * capped every caller at the backend's own default and isRead/type filters
 * did nothing.
 */
export async function GET(request: NextRequest) {
  return proxyJson(`/notifications${request.nextUrl.search}`);
}
