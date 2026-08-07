import 'server-only';
import { getValidAccessToken } from '../auth/session';
import { getGlobalAdminEnv } from '../env';

export class ApiUnauthenticatedError extends Error {
  constructor() {
    super('No valid session — caller must redirect to /api/auth/login');
    this.name = 'ApiUnauthenticatedError';
  }
}

/**
 * Server-side helper for calling backend/api's `/platform/*` surface with a
 * bearer token issued by the "topiadesk-platform" realm — see
 * frontend/web/lib/api/server-fetch.ts for the identical pattern this
 * mirrors (client components never call API_URL directly; every data view
 * goes through a same-origin `app/api/**` BFF route that calls this
 * server-side).
 */
export async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new ApiUnauthenticatedError();
  }
  const env = getGlobalAdminEnv();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
