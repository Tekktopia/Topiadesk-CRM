/**
 * Client-side fetch helper for app/(crm)/**'s TanStack Query hooks.
 *
 * Always hits a same-origin `/api/crm/**` Route Handler (never the API
 * origin directly — see lib/api/server-fetch.ts's header comment) so the
 * HttpOnly session cookie is sent automatically and the Route Handler can
 * attach the bearer token server-side.
 */
import { csrfHeaders } from '@/lib/csrf';

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

/**
 * Thrown instead of a network error when a mutation has been safely queued
 * for replay (see lib/offline/outbox.ts). Callers that want to show "saved,
 * will sync" rather than "failed" can check `queued`.
 */
export class OfflineQueuedError extends Error {
  readonly queued = true;
  constructor(public readonly label: string) {
    super(`You're offline — "${label}" was saved on this device and will sync when you're back online.`);
    this.name = 'OfflineQueuedError';
  }
}

const QUEUEABLE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders(init?.method), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      throw new ApiRequestError(await parseErrorMessage(res), res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (err) {
    // Only a genuine transport failure gets queued. An ApiRequestError means
    // the server answered and rejected this write on its merits — queueing
    // that would replay a request already known to be invalid.
    if (err instanceof ApiRequestError) throw err;
    if (!QUEUEABLE_METHODS.has(method) || (typeof navigator !== 'undefined' && navigator.onLine)) throw err;

    const { enqueue } = await import('@/lib/offline/outbox');
    const label = describeMutation(method, path);
    await enqueue({
      path,
      method: method as 'POST' | 'PATCH' | 'DELETE',
      body: typeof init?.body === 'string' ? init.body : undefined,
      // Generated once, here, and reused for every replay attempt — that
      // stable identity is what the server's IdempotencyInterceptor keys on
      // to collapse duplicates. Regenerating it per attempt would defeat
      // the entire mechanism.
      idempotencyKey: crypto.randomUUID(),
      label,
    });
    throw new OfflineQueuedError(label);
  }
}

/** Best-effort human label for the pending-changes list, from the REST shape alone. */
function describeMutation(method: string, path: string): string {
  const resource = path.replace(/^\/api\/crm\//, '').split('?')[0]!.split('/')[0]!.replace(/-/g, ' ');
  const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
  if (method === 'POST') return `New ${singular}`;
  if (method === 'DELETE') return `Delete ${singular}`;
  return `Update ${singular}`;
}

/** Builds a `?a=1&b=2` query string, dropping undefined/null/empty values. */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
