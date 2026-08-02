import 'server-only';
import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

/**
 * Shared body for the small BFF proxy Route Handlers under app/api/** that
 * this feature area (policy/premium/renewal/document/dashboard) owns — see
 * lib/api/server-fetch.ts's header comment for why Client Components can't
 * call backend/api directly. Every handler here does the same three things
 * (call fetchApi, pass the status/body through, translate the "no session"
 * case to a clean 401 instead of an unhandled throw) so this collapses that
 * into one place instead of repeating it in every route.ts.
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
      const message =
        body && typeof body === 'object' && 'message' in body
          ? (body as { message: unknown }).message
          : (res.statusText ?? 'Request failed');
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

/** Same contract as `proxyJson` but forwards the upstream response body as a
 * raw stream instead of parsing JSON — for file download passthrough
 * (GET /documents/:id/download), where the body is binary and headers
 * (Content-Type/Content-Disposition/Content-Length) must survive intact. */
export async function proxyStream(path: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await fetchApi(path, init);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ message: text || res.statusText }, { status: res.status });
    }
    const headers = new Headers();
    for (const key of ['content-type', 'content-disposition', 'content-length']) {
      const value = res.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new NextResponse(res.body, { status: res.status, headers });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[api proxy] ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}

/** Forwards the incoming request's `Authorization`-less multipart body
 * as-is to backend/api — used by the two file-upload endpoints
 * (POST /documents, POST /documents/:id/versions). `fetchApi` supplies the
 * bearer token; the multipart boundary/content-type comes straight off the
 * inbound `Request` so we never need to re-parse and re-serialize the file
 * through Node's FormData (which would double the memory footprint for
 * large uploads). */
export async function proxyMultipart(path: string, request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  return proxyJson(path, { method: 'POST', body: formData });
}
