import 'server-only';
import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

/**
 * Shared helper for the Campaigns BFF Route Handlers (app/api/campaigns/**,
 * app/api/campaign-templates/**, app/api/audience-segments/**,
 * app/api/campaign-suppressions/**). Mirrors app/api/crm/_shared.ts — see
 * that file (and lib/api/server-fetch.ts's header comment) for why these
 * same-origin proxies exist at all. Not a `route.ts` file, so Next.js never
 * registers it as an endpoint itself.
 *
 * Forwards backend/api's response status + JSON body byte-for-byte
 * (including its error envelope shape from GlobalExceptionFilter) so
 * client-side error handling (app/(campaigns)/_lib/api.ts's `apiFetch`) can
 * read `.message` the same way whether the failure came from validation,
 * RLS, or a 404.
 */
export async function proxyJson(path: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await fetchApi(path, init);
    const text = await res.text();
    return new NextResponse(text.length > 0 ? text : null, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ statusCode: 401, message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[campaigns proxy] ${init?.method ?? 'GET'} ${path} failed`, err);
    return NextResponse.json({ statusCode: 502, message: 'Upstream API request failed' }, { status: 502 });
  }
}

/** For POST/PATCH bodies: pass the request's raw text straight through to fetchApi — no re-serialization needed. */
export async function forwardBody(request: Request, path: string, method: 'POST' | 'PATCH'): Promise<NextResponse> {
  const body = await request.text();
  return proxyJson(path, { method, body, headers: { 'Content-Type': 'application/json' } });
}
