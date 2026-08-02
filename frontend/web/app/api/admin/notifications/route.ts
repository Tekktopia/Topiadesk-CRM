import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/notifications — RLS-scoped to the caller's own
 * notifications on the backend (no @RequirePermission on this controller —
 * every authenticated user has an inbox, not just admins). */
export async function GET() {
  return proxy('/notifications');
}
