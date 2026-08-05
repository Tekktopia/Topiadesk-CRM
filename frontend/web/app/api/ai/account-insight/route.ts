import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * Advisory renewal-meeting-prep brief for one account — see
 * backend/api/src/modules/ai-gateway/ai-gateway.service.ts's accountInsight().
 * Metered (real Anthropic spend) and gated by the org/user cost caps, so the
 * caller must trigger this explicitly rather than auto-fetching it — see
 * app/(crm)/accounts/[id]/_components/ai-insight-panel.tsx.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/ai/account-insight', {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body || undefined,
  });
}
