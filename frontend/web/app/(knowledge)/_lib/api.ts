/**
 * Client-side fetch helper for this route group's same-origin BFF routes
 * (app/api/knowledge-categories/**, app/api/knowledge-articles/**,
 * app/api/surveys/**). Never calls backend/api's origin directly — see
 * lib/api/server-fetch.ts's header comment for why Client Components can't
 * attach the HttpOnly-cookie-based access token themselves. Deliberately a
 * local copy rather than importing app/(admin)/admin/_lib/api.ts — this
 * batch's five sibling agents are each scoped to their own route group in
 * parallel, so cross-group imports would be a merge-conflict/coupling risk
 * for a ~20-line file (same reasoning knowledge-articles.controller.ts's
 * DecideKnowledgeApprovalDto gives for duplicating over importing).
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

/** Builds a `?a=1&b=2` query string, dropping undefined/empty values — shared
 * by every list hook in queries.ts that forwards filters to a BFF GET route. */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
