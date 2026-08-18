/**
 * Client-side fetch helper for the Admin domain's same-origin BFF routes
 * (app/api/admin/**, see that tree's `_lib/proxy.ts`). Never calls
 * backend/api's origin directly — see lib/api/server-fetch.ts's header
 * comment for why Client Components can't attach the HttpOnly-cookie-based
 * access token themselves.
 */
import { csrfHeaders } from '@/lib/csrf';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeaders(init?.method),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Request failed (${res.status})`), res.status);
  }
  return body as T;
}

/** True when a query/mutation error is an ApiError with the given HTTP status. */
export function isApiErrorStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}
