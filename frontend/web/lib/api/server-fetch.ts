import 'server-only';
import { getValidAccessToken } from '../auth/session';
import { getWebEnv } from '../env';

export class ApiUnauthenticatedError extends Error {
  constructor() {
    super('No valid session — caller must redirect to /api/auth/login');
    this.name = 'ApiUnauthenticatedError';
  }
}

/**
 * Server-side helper for calling the NestJS API with a bearer token —
 * this is what Route Handlers / Server Actions should use to reach
 * backend/api (e.g. GET /identity/me, see app/api/auth/session/route.ts for
 * the reference usage `useCurrentUser()` is built on).
 *
 * Client Components must NOT call `API_URL` directly: the access token
 * lives only in an HttpOnly cookie, invisible to browser JS by design, so
 * there is nothing for a client-side `fetch` to attach as `Authorization`.
 * The pattern for client-side data fetching (TanStack Query `useQuery`) is
 * to add a same-origin Next.js Route Handler under `app/api/**` that calls
 * `fetchApi()` server-side and returns JSON — a small BFF proxy per
 * resource. `app/api/auth/session/route.ts` is the worked example; Batch 2
 * agents building CRM/Policy/Admin data views should follow the same
 * shape rather than exposing the API origin to the browser.
 */
export async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new ApiUnauthenticatedError();
  }
  const env = getWebEnv();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  // Prefer the Docker-internal API URL for server-to-server calls (see
  // env.ts) — falls back to the public API_URL for standalone dev.
  const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    // API calls always need fresh, user-scoped data — never let Next's
    // fetch cache serve one user's response to another.
    cache: 'no-store',
  });
}
