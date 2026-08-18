import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/compliance/summary -> GET /crm/compliance/summary (ComplianceController.summary). */
export async function GET() {
  return proxyJson('/crm/compliance/summary');
}
