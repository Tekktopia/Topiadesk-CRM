import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH /api/notifications/:id/read -> PATCH /notifications/:id/read (NotificationsController.markRead). */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/notifications/${id}/read`, { method: 'PATCH' });
}
