import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/surveys/:id/responses -> GET /surveys/:id/responses
 * (SurveysController.responses) — filters (agentId/from/to) forwarded
 * as-is. respondToken is stripped server-side by the backend DTO before
 * this ever sees it (SurveyResponseRecordDto's header comment). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/surveys/${id}/responses${request.nextUrl.search}`);
}
