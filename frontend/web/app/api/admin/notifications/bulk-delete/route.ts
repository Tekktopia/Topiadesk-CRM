import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/notifications/bulk-delete -> POST /notifications/bulk-delete (NotificationsController.bulkDelete). */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/notifications/bulk-delete', 'POST');
}
