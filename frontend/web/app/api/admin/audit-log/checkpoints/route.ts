import { proxy } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/audit-log/checkpoints — proxies backend/api's
 * GET /identity/audit-log/checkpoints (AuditExportController.checkpoints),
 * recent checkpoints newest-first. Populates the admin UI's checkpoint
 * history and lets "Verify since last checkpoint" default to the most
 * recent one instead of always rescanning from genesis. */
export async function GET() {
  return proxy('/identity/audit-log/checkpoints');
}
