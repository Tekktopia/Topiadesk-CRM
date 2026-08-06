import 'server-only';
import { readPortalSessionToken } from './session';
import { getWebEnv } from '../env';

export class PortalUnauthenticatedError extends Error {
  constructor() {
    super('No valid portal session — caller must redirect to /portal/login');
    this.name = 'PortalUnauthenticatedError';
  }
}

/**
 * Portal analog of `lib/api/server-fetch.ts`'s `fetchApi()` — forwards the
 * portal session token as `X-Portal-Session-Token`, a plain custom header
 * rather than `Authorization: Bearer`, keeping the two auth models visibly
 * distinct on both sides. See backend/api's PortalContextMiddleware header
 * comment for why the backend deliberately reads this exact header name
 * instead of treating a portal session like a Keycloak-issued JWT.
 */
export async function fetchPortalApi(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await readPortalSessionToken();
  if (!token) {
    throw new PortalUnauthenticatedError();
  }
  const env = getWebEnv();
  const headers = new Headers(init.headers);
  headers.set('X-Portal-Session-Token', token);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
