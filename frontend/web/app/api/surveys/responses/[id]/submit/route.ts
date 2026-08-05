import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/surveys/responses/:id/submit -> POST /surveys/responses/:id/submit
 * (SurveyResponsesController.submit) — the ONE public, unauthenticated BFF
 * route in this scope. The respondent is an external contact clicking an
 * emailed/SMS'd link (app/(knowledge)/survey-respond/[token]/page.tsx), with
 * no TopiaDesk session at all.
 *
 * Deliberately does NOT use fetchApi()/proxyJson() (lib/api/server-fetch.ts,
 * app/api/_lib/proxy.ts) — both call getValidAccessToken() and throw
 * ApiUnauthenticatedError with no session cookie, which is exactly the
 * caller this route exists to serve. This forwards the request body as-is
 * with no Authorization header, matching the backend route's own guardless
 * setup (no @UseGuards on SurveyResponsesController) — auth there is
 * "possession of respondToken", verified server-side with a constant-time
 * compare (SurveysService.submitResponse()), not a bearer token. The
 * backend route is also excluded from RlsContextMiddleware
 * (app.module.ts's `.exclude({ path: 'surveys/responses/:id/submit', ... })`
 * — already wired in by the Phase 2 integration pass) and runs under
 * SYSTEM_JOB_CONTEXT internally, so no bound RLS context is needed from
 * this side either.
 *
 * middleware.ts's matcher also excludes `api/surveys/responses` (and
 * `survey-respond`, the page that calls this) from the session-cookie
 * redirect gate — without that, an anonymous request would never reach this
 * handler at all.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const env = getWebEnv();
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  const body = await request.text();

  try {
    const res = await fetch(`${apiBaseUrl}/surveys/responses/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text.length > 0 ? text : null, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[surveys proxy] POST /surveys/responses/${id}/submit failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
