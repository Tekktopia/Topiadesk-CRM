import 'server-only';
import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

/**
 * Shared BFF proxy body — direct copy of frontend/web/app/api/_lib/proxy.ts's
 * `proxyJson` (see that file's header comment for the full reasoning).
 * Every `/platform/*` BFF route in this app uses this instead of hand-
 * rolling the same status/body passthrough.
 */
export async function proxyJson(path: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await fetchApi(path, init);
    const status = res.status;
    if (status === 204) return new NextResponse(null, { status });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }
    if (!res.ok) {
      const message = body && typeof body === 'object' && 'message' in body ? (body as { message: unknown }).message : (res.statusText ?? 'Request failed');
      return NextResponse.json({ message }, { status });
    }
    return NextResponse.json(body, { status });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[api proxy] ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
