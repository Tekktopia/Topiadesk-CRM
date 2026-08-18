import 'server-only';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/public/tenant-branding/:realmName/logo -> backend/api's
 * GET /public/tenant-branding/:realmName/logo
 * (PublicTenantBrandingController.logo) — this is the URL
 * infra/keycloak/themes/topiadesk/login/theme.properties's
 * tenantBrandingBaseUrl points the login page's <img> tag at
 * (${tenantBrandingBaseUrl}/api/public/tenant-branding/${realm.name}/logo),
 * so it has to exist here on `web`'s own origin — Traefik routes
 * app.${domain} to this Next.js app, not straight to backend/api, and only
 * paths with a matching route.ts under app/api/** ever reach it.
 *
 * Binary image body, so this can't reuse app/api/public/_lib/public-proxy.ts
 * (that one JSON-parses/re-serializes the response) — streams the bytes
 * through instead, same shape as app/api/_lib/proxy.ts's proxyStream, minus
 * the authenticated fetchApi() wrapper (an anonymous login-page visitor has
 * no session cookie at all, matching every other app/api/public/** route's
 * own no-auth publicProxy()).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ realmName: string }> }): Promise<NextResponse> {
  const { realmName } = await params;
  const env = getWebEnv();
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  try {
    const res = await fetch(`${apiBaseUrl}/public/tenant-branding/${encodeURIComponent(realmName)}/logo`, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ message: text || res.statusText }, { status: res.status });
    }
    const headers = new Headers();
    for (const key of ['content-type', 'cache-control']) {
      const value = res.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new NextResponse(res.body, { status: res.status, headers });
  } catch (err) {
    console.error(`[public proxy] tenant-branding/${realmName}/logo failed`, err);
    return NextResponse.json({ message: 'Upstream API request failed' }, { status: 502 });
  }
}
