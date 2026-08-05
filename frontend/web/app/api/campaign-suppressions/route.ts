import { proxyJson } from '../campaigns/_shared';

export const runtime = 'nodejs';

/**
 * GET /api/campaign-suppressions -> GET /campaign-suppressions. Upstream
 * 404s today — backend/api has no authenticated CampaignSuppression list
 * endpoint (only the unauthenticated system writers:
 * public-unsubscribe.controller.ts and campaign-webhooks.controller.ts).
 * Proxied anyway so the suppressions page lights up automatically once
 * that endpoint lands; the page renders an explicit "not exposed yet"
 * state on the 404 until then (see suppressions-list-view.tsx).
 */
export async function GET() {
  return proxyJson('/campaign-suppressions');
}
