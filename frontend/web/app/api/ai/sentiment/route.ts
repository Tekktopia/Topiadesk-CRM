import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/**
 * Advisory sentiment analysis for one piece of text (e.g. an Activity's
 * body) — never written back to the record, see
 * backend/api/src/modules/ai-gateway/dto/sentiment-request.dto.ts's header
 * comment. Metered and cost-capped like every other /ai/* call.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/ai/sentiment', {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body || undefined,
  });
}
