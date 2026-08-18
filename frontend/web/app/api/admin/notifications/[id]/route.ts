import type { NextRequest } from 'next/server';
import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** DELETE /api/admin/notifications/:id -> DELETE /notifications/:id (NotificationsController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/notifications/${id}`, { method: 'DELETE' });
}
