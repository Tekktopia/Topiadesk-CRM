import { proxyJson } from '../../campaigns/_shared';

export const runtime = 'nodejs';

/** GET /api/campaign-templates/merge-fields — fixed merge-field descriptor allowlist for template authoring. */
export async function GET() {
  return proxyJson('/campaign-templates/merge-fields');
}
