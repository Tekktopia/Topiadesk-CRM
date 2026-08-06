/**
 * Client-side fetch helper for app/(cases)/**'s TanStack Query hooks.
 *
 * Always hits a same-origin `/api/**` Route Handler (never the API origin
 * directly — see lib/api/server-fetch.ts's header comment) so the HttpOnly
 * session cookie is sent automatically and the Route Handler can attach the
 * bearer token server-side. Mirrors app/(crm)/_lib/api.ts exactly.
 */
export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  } catch {
    // response body wasn't JSON — fall through to the generic message
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new ApiRequestError(await parseErrorMessage(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Builds a `?a=1&b=2` query string, dropping undefined/null/empty values. Array values are appended once per entry (`?a=1&a=2`), matching how CaseQueryDto's array params (assignedToIds, statuses, ...) parse a repeated key. */
export function buildQuery(params: Record<string, string | number | boolean | string[] | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
