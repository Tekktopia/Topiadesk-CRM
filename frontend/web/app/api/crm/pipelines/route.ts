import { proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/pipelines — no RLS, org-wide config (New Business, Renewals, ...). */
export async function GET() {
  return proxyJson('/crm/pipelines');
}
