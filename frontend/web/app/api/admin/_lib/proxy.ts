import 'server-only';
import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

/**
 * Shared BFF proxy body for every Route Handler under app/api/admin/** —
 * each route in this subtree is a thin same-origin pass-through to
 * backend/api's identity/integrations/notifications modules via
 * `fetchApi()` (see lib/api/server-fetch.ts's header comment: Client
 * Components can't attach the HttpOnly-cookie access token themselves, so
 * this proxy does it server-side). Centralizing the fetch/error-shape
 * handling here keeps each route.ts a one-line-per-verb declaration
 * instead of repeating try/catch boilerplate ~25 times.
 */
export async function proxy(path: string, init: RequestInit = {}): Promise<NextResponse> {
  try {
    const res = await fetchApi(path, init);
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[api/admin] ${init.method ?? 'GET'} ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream request to backend/api failed' }, { status: 502 });
  }
}

/** For POST/PATCH/PUT routes: forwards the incoming Request's JSON body
 * verbatim to backend/api at `path` with `method`. */
export async function proxyWithBody(request: Request, path: string, method: string): Promise<NextResponse> {
  const body = await request.text();
  return proxy(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body || undefined,
  });
}
