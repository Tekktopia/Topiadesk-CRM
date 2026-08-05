import 'server-only';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

/**
 * Same reasoning as app/api/surveys/responses/[id]/submit/route.ts's header
 * comment: for genuinely public/anonymous backend routes (the live chat
 * widget's own endpoints here), deliberately does NOT use
 * fetchApi()/proxyJson() (lib/api/server-fetch.ts, app/api/_lib/proxy.ts) —
 * both require a session cookie and throw ApiUnauthenticatedError without
 * one. This forwards the request with no Authorization header, matching
 * the backend route's own guardless setup (auth there, where it applies at
 * all, is a signed session token in the body/query — see
 * live-chat.controller.ts). middleware.ts's matcher must also exclude
 * `api/public` from the session-cookie redirect gate for this to ever be
 * reached by an anonymous visitor.
 */
export async function publicProxy(path: string, init?: RequestInit): Promise<NextResponse> {
  const env = getWebEnv();
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text.length > 0 ? text : null, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[public proxy] ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
