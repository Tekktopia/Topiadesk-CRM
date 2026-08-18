import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/admin/notifications/read-all -> PATCH /notifications/read-all (NotificationsController.markAllRead). */
export async function PATCH() {
  return proxy('/notifications/read-all', { method: 'PATCH' });
}
