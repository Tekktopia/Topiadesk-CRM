import type { NextRequest } from 'next/server';
import { proxyStream } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/audit-log/export — proxies backend/api's streamed
 * GET /identity/audit-log/export (AuditExportController.export), a
 * separate controller from the plain list at GET /audit-log. Query params
 * (format=csv|ndjson, entityType?, from?, to?) forwarded as-is; streamed
 * through rather than JSON-parsed so the browser's native download UX
 * (filename via Content-Disposition) works. */
export async function GET(request: NextRequest) {
  return proxyStream(`/identity/audit-log/export${request.nextUrl.search}`);
}
