import 'server-only';
import { NextResponse } from 'next/server';
import { PortalUnauthenticatedError, fetchPortalApi } from '@/lib/portal-auth/server-fetch';

/** Portal analog of `app/api/_lib/proxy.ts`'s `proxyJson`/`proxyStream` —
 * same shape, but authenticates via the portal session cookie instead of
 * the internal staff session. See that file's header comment for why this
 * collapses into a shared helper rather than repeating it in every route.ts. */
export async function portalProxyJson(path: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await fetchPortalApi(path, init);
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
    if (err instanceof PortalUnauthenticatedError) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[portal proxy] ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}

/** Streaming variant for the document download passthrough — headers
 * (Content-Type/Content-Disposition/Content-Length) survive intact. */
export async function portalProxyStream(path: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await fetchPortalApi(path, init);
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
    if (err instanceof PortalUnauthenticatedError) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    console.error(`[portal proxy] ${path} failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
