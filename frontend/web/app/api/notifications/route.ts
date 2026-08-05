import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/notifications -> GET /notifications (NotificationsController.listMine, RLS-scoped to the caller). */
export async function GET() {
  return proxyJson('/notifications');
}
