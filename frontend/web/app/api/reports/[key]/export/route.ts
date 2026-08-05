import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/reports/:key/export -> GET /reports/:key/export
 * (ReportsController.export, ExportReportQueryDto: `format` +
 * JSON-encoded `filters` + optional `dimension`). Returns
 * `{downloadUrl, rowCount, expiresInSeconds}` — a short-lived signed MinIO
 * GET URL (see packages/reports/src/storage/report-storage.ts), not the
 * file itself, so this stays a small JSON proxy rather than a stream
 * passthrough; the client opens `downloadUrl` directly. An export endpoint
 * already existed in the Phase 2 backend build (xlsx/csv/pdf, full
 * unpaginated row set) — reused here rather than reimplementing CSV
 * generation client-side from the already-fetched (possibly paginated)
 * `/run` response.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await params;
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const format = searchParams.get('format');
  const filters = searchParams.get('filters');
  const dimension = searchParams.get('dimension');
  if (format) qs.set('format', format);
  if (filters) qs.set('filters', filters);
  if (dimension) qs.set('dimension', dimension);
  return proxyJson(`/reports/${key}/export?${qs.toString()}`);
}
