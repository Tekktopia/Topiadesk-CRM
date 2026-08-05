import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/reports/custom/entities -> GET /custom-reports/entities (CustomReportController.listEntities). */
export async function GET() {
  return proxyJson('/custom-reports/entities');
}
